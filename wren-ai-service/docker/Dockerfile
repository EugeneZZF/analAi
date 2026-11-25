FROM ghcr.io/canner/wren-ai-service:0.29.3

ENV VIRTUAL_ENV=/app/.venv \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

RUN /app/.venv/bin/pip install --no-cache-dir fastembed

COPY src src
COPY skills skills
COPY entrypoint.sh /app/entrypoint.sh
COPY pyproject.toml pyproject.toml
RUN sed -i 's/\r$//' /app/entrypoint.sh && chmod +x /app/entrypoint.sh

ENTRYPOINT [ "/app/entrypoint.sh" ]
