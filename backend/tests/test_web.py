"""
本番用の配信アプリ (app.web) のテスト。ビルド出力は、一時フォルダに小さな index.html と静的ファイルを作って代わりにする
"""
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import web
from app.main import app as api_app

INDEX_HTML = "<!doctype html><title>打順シミュレーター</title><div id=\"root\"></div>"
ASSET_JS = "console.log('asset')"

STATS = {
    "PA": 600, "AB": 540, "H": 150, "2B": 30, "3B": 5, "HR": 15, "BB": 40, "HBP": 10,
    "SO": 100, "SF": 5, "SH": 5, "GIDP": 10, "SB": 10, "CS": 3,
}


@pytest.fixture
def dist(tmp_path: Path) -> Path:
    (tmp_path / "index.html").write_text(INDEX_HTML, encoding="utf-8")
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "index-abc.js").write_text(ASSET_JS, encoding="utf-8")
    return tmp_path


@pytest.fixture
def client(dist: Path) -> TestClient:
    return TestClient(web.create_app(dist))


def test_root_and_unknown_paths_return_index_html(client):
    for path in ["/", "/index.html", "/some/screen", "/order"]:
        res = client.get(path)
        assert res.status_code == 200, path
        assert res.text == INDEX_HTML, path
        assert res.headers["content-type"].startswith("text/html")


def test_static_files_are_served(client):
    res = client.get("/assets/index-abc.js")
    assert res.status_code == 200
    assert res.text == ASSET_JS


def test_api_is_served_under_api_with_the_same_paths_as_the_dev_proxy(client):
    assert client.get("/api/health").json() == {"status": "ok"}
    seasons = client.get("/api/presets/seasons", params={"league": "mlb"})
    assert seasons.status_code == 200
    assert 2025 in seasons.json()["seasons"]
    body = {"batters": {f"b{i}": STATS for i in range(9)}, "input_order": [f"b{i}" for i in range(9)]}
    res = client.post("/api/lineup/evaluate", json=body)
    assert res.status_code == 200
    # 同じ入力を、今のアプリ (API のみ。パスに /api が無い) で計算した値と同じ
    direct = TestClient(api_app).post("/lineup/evaluate", json=body).json()
    assert res.json()["input_order_runs_per_game"] == direct["input_order_runs_per_game"]


def test_unknown_api_paths_stay_404_and_do_not_fall_back_to_index_html(client):
    for path in ["/api/unknown", "/api/presets/unknown/path", "/api/"]:
        res = client.get(path)
        assert res.status_code == 404, path
        assert INDEX_HTML not in res.text


def test_api_docs_open_under_api(client):
    docs = client.get("/api/docs")
    assert docs.status_code == 200
    assert "swagger" in docs.text.lower()
    # ドキュメントが読み込む OpenAPI の定義も /api の下にある
    assert "/api/openapi.json" in docs.text
    spec = client.get("/api/openapi.json")
    assert spec.status_code == 200
    assert "/lineup/evaluate" in spec.json()["paths"]


def test_without_dist_the_current_api_app_is_used_as_is(tmp_path: Path):
    missing = tmp_path / "no-dist"
    assert web.create_app(missing) is api_app
    # index.html の無いフォルダも、ビルド出力とはみなさない
    empty = tmp_path / "empty"
    empty.mkdir()
    assert web.create_app(empty) is api_app
    client = TestClient(web.create_app(missing))
    assert client.get("/health").json() == {"status": "ok"}
    assert client.get("/api/health").status_code == 404


def test_dist_dir_can_be_set_by_environment_variable(monkeypatch, tmp_path: Path):
    monkeypatch.setenv(web.DIST_ENV, str(tmp_path))
    assert web.dist_dir_from_env() == tmp_path
    monkeypatch.delenv(web.DIST_ENV)
    assert web.dist_dir_from_env() == web.DEFAULT_DIST_DIR
    assert web.DEFAULT_DIST_DIR.parts[-2:] == ("frontend", "dist")
