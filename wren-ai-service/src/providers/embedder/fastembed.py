import asyncio
from typing import Any, Dict, List

from fastembed import TextEmbedding
from haystack import Document, component

from src.core.provider import EmbedderProvider
from src.providers.loader import provider


@component
class FastEmbedTextEmbedder:
    """Haystack component that embeds a single query string using FastEmbed."""

    def __init__(self, embedding_model: TextEmbedding, model_name: str):
        self._embedding_model = embedding_model
        self._model_name = model_name

    @component.output_types(embedding=List[float], meta=Dict[str, Any])
    async def run(self, text: str):
        if not isinstance(text, str):
            raise TypeError(
                "FastEmbedTextEmbedder expects a string as an input."
            )

        cleaned = text.replace("\n", " ")

        def _embed() -> List[float]:
            vectors = list(self._embedding_model.embed([cleaned]))
            return vectors[0].tolist()

        embedding = await asyncio.to_thread(_embed)
        return {"embedding": embedding, "meta": {"model": self._model_name}}


@component
class FastEmbedDocumentEmbedder:
    """Haystack component that embeds a batch of Documents using FastEmbed."""

    def __init__(
        self,
        embedding_model: TextEmbedding,
        model_name: str,
        batch_size: int = 32,
    ):
        self._embedding_model = embedding_model
        self._model_name = model_name
        self._batch_size = batch_size

    @component.output_types(documents=List[Document], meta=Dict[str, Any])
    async def run(self, documents: List[Document]):
        if (
            not isinstance(documents, list)
            or documents
            and not isinstance(documents[0], Document)
        ):
            raise TypeError(
                "FastEmbedDocumentEmbedder expects a list of Documents as input."
            )

        if not documents:
            return {"documents": [], "meta": {"model": self._model_name}}

        texts = [(doc.content or "").replace("\n", " ") for doc in documents]

        def _embed_all() -> List[List[float]]:
            return [
                vec.tolist()
                for vec in self._embedding_model.embed(
                    texts, batch_size=self._batch_size
                )
            ]

        embeddings = await asyncio.to_thread(_embed_all)
        for doc, emb in zip(documents, embeddings):
            doc.embedding = emb

        return {"documents": documents, "meta": {"model": self._model_name}}


@provider("fastembed_embedder")
class FastEmbedProvider(EmbedderProvider):
    """Local CPU embedder provider backed by FastEmbed (no external API key required)."""

    def __init__(
        self,
        model: str = "BAAI/bge-small-en-v1.5",
        batch_size: int = 32,
        **_,
    ):
        self._embedding_model = model
        self._batch_size = batch_size
        self._client = TextEmbedding(model_name=model)

    def get_text_embedder(self):
        return FastEmbedTextEmbedder(
            embedding_model=self._client,
            model_name=self._embedding_model,
        )

    def get_document_embedder(self):
        return FastEmbedDocumentEmbedder(
            embedding_model=self._client,
            model_name=self._embedding_model,
            batch_size=self._batch_size,
        )
