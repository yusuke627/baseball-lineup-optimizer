"""
本番用の配信アプリ: API とビルドしたフロントエンドを、1つのサービスで配信する (docs/DESIGN.md 2章「デプロイの構成」)。

- API (app.main の app) は変更せず、/api の下に載せる。開発時の Vite の中継 (/api を取り除いて転送) と同じパスになる
  (例: /api/health → /health、/api/lineup/evaluate → /lineup/evaluate)。API の自動ドキュメントは /api/docs
- それ以外のパスは、フロントエンドのビルド出力 (frontend/dist) のファイルを返す。存在しないパスは index.html を返す。
  /api の下の存在しないパスは、API の 404 のまま
- ビルド出力が無いとき (開発時) は、app.main の app をそのまま使う (API はルートのパスのまま)

起動: uvicorn app.web:app (開発時は今までどおり uvicorn app.main:app と Vite の開発サーバー)。
ビルド出力の場所は環境変数 FRONTEND_DIST_DIR で指定できる (既定はリポジトリの frontend/dist)。
"""
from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI
from starlette.exceptions import HTTPException
from starlette.responses import Response
from starlette.staticfiles import StaticFiles
from starlette.types import Scope

from app.main import app as api_app

DIST_ENV = "FRONTEND_DIST_DIR"
DEFAULT_DIST_DIR = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"


class SinglePageStaticFiles(StaticFiles):
    """ビルド出力のファイルを返し、存在しないパスには index.html を返す (画面の遷移のため)"""

    async def get_response(self, path: str, scope: Scope) -> Response:
        try:
            return await super().get_response(path, scope)
        except HTTPException as exc:
            if exc.status_code != 404:
                raise
            return await super().get_response("index.html", scope)


def dist_dir_from_env() -> Path:
    value = os.environ.get(DIST_ENV)
    return Path(value) if value else DEFAULT_DIST_DIR


def create_app(dist_dir: Path) -> FastAPI:
    """ビルド出力 (index.html) があれば、API を /api に載せて画面も配信するアプリを、無ければ app.main の app を返す"""
    if not (dist_dir / "index.html").is_file():
        return api_app
    web = FastAPI(title="打順シミュレーター", docs_url=None, redoc_url=None, openapi_url=None)
    web.mount("/api", api_app)
    web.mount("/", SinglePageStaticFiles(directory=dist_dir, html=True), name="frontend")
    return web


app = create_app(dist_dir_from_env())
