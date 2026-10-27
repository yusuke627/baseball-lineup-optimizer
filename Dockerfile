# 打順シミュレーターを1つのサービスとして動かすイメージ (docs/DESIGN.md 2章「デプロイの構成」)。
# FastAPI (app.web:app) が、/api の下で API を、それ以外のパスでビルドしたフロントエンドを配信する。

# 1段目: フロントエンドをビルドする (Node の版は frontend/.nvmrc と同じ)
FROM node:24.19.0-bookworm-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# 2段目: 実行用のイメージ。実行時の依存だけを入れる (開発用の [dev] は入れない)
FROM python:3.13.14-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=8000
WORKDIR /app

# リポジトリと同じ並び (backend・data/presets・frontend/dist) に置く。
# 選手データは backend/app/data_loader.py が、ソースの位置から ../data/presets を探すため、
# app はソースのまま動かす (編集可能モードで入れ、依存だけを site-packages に入れる)
COPY backend/pyproject.toml backend/
COPY backend/app backend/app
RUN pip install --no-cache-dir -e ./backend
COPY data/presets data/presets
COPY --from=frontend /app/frontend/dist frontend/dist

# root ではないユーザーで動かす
RUN useradd --create-home --uid 10001 appuser
USER appuser

WORKDIR /app/backend
EXPOSE 8000
# OPENBLAS_NUM_THREADS の既定値 (1) は app/__init__.py が設定する。ヘルスチェックは /api/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/api/health' % os.environ.get('PORT', '8000'), timeout=4)"
CMD ["sh", "-c", "exec uvicorn app.web:app --host 0.0.0.0 --port ${PORT:-8000}"]
