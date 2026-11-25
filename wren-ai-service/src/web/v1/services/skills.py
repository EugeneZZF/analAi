import json
import logging
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml
from pydantic import BaseModel, Field

logger = logging.getLogger("wren-ai-service")

_CYRILLIC_TO_LATIN = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo",
    "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "kh", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "shch",
    "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
}


def slugify(value: str) -> str:
    text = (value or "").strip().lower()
    transliterated = "".join(_CYRILLIC_TO_LATIN.get(ch, ch) for ch in text)
    slug = re.sub(r"[^a-z0-9]+", "-", transliterated).strip("-")
    return slug or f"skill-{int(datetime.now(timezone.utc).timestamp())}"


def _ensure_str_list(val: Any) -> List[str]:
    if not val:
        return []
    if isinstance(val, list):
        return [str(item).strip() for item in val if str(item).strip()]
    if isinstance(val, str):
        return [part.strip() for part in re.split(r"[,\n;]+", val) if part.strip()]
    return [str(val).strip()]


class SkillDocument(BaseModel):
    id: str
    slug: str
    name: str
    description: str = ""
    category: str = "General"
    tags: List[str] = Field(default_factory=list)
    triggers: List[str] = Field(default_factory=list)
    questions: List[str] = Field(default_factory=list)
    content: str = ""
    raw_markdown: str = ""
    enabled: bool = True
    is_global: bool = False
    is_shared: bool = True
    is_builtin: bool = False
    project_id: Optional[str] = None
    author: str = "User"
    version: str = "1.0"
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    updated_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


class SkillCreateOrUpdateRequest(BaseModel):
    id: Optional[str] = None
    slug: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    triggers: Optional[List[str]] = None
    questions: Optional[List[str]] = None
    content: Optional[str] = None
    raw_markdown: Optional[str] = None
    enabled: Optional[bool] = None
    is_global: Optional[bool] = None
    is_shared: Optional[bool] = None
    project_id: Optional[str] = None
    author: Optional[str] = None
    version: Optional[str] = None


class SkillImportRequest(BaseModel):
    raw_markdown: str
    project_id: Optional[str] = None
    is_shared: bool = True
    overwrite: bool = True


def parse_skill_markdown(
    raw_markdown: str,
    fallback_slug: Optional[str] = None,
    is_builtin_default: bool = False,
) -> Dict[str, Any]:
    text = (raw_markdown or "").strip()
    meta: Dict[str, Any] = {}
    body = text

    frontmatter_match = re.match(
        r"^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)([\s\S]*)$", text
    )
    if frontmatter_match:
        yaml_block = frontmatter_match.group(1)
        body = frontmatter_match.group(2).strip()
        try:
            loaded = yaml.safe_load(yaml_block)
            if isinstance(loaded, dict):
                meta = loaded
        except Exception as e:
            logger.warning(f"Failed to parse SKILL.md YAML frontmatter: {e}")

    name = str(meta.get("name") or "").strip()
    if not name:
        heading_match = re.search(r"^#\s+(.+)$", body, re.MULTILINE)
        if heading_match:
            name = heading_match.group(1).strip()
        elif fallback_slug:
            name = fallback_slug.replace("-", " ").title()
        else:
            name = "Analytical Skill"

    raw_slug = str(meta.get("slug") or meta.get("id") or fallback_slug or name).strip()
    slug = slugify(raw_slug)

    return {
        "id": slug,
        "slug": slug,
        "name": name,
        "description": str(meta.get("description") or "").strip(),
        "category": str(meta.get("category") or "General").strip(),
        "tags": _ensure_str_list(meta.get("tags")),
        "triggers": _ensure_str_list(meta.get("triggers")),
        "questions": _ensure_str_list(meta.get("questions")),
        "content": body,
        "enabled": bool(meta.get("enabled", True)),
        "is_global": bool(meta.get("is_global", meta.get("isDefault", False))),
        "is_shared": bool(meta.get("is_shared", True)),
        "is_builtin": bool(meta.get("is_builtin", is_builtin_default)),
        "project_id": str(meta["project_id"]) if meta.get("project_id") is not None else None,
        "author": str(meta.get("author") or ("WrenAI Analytics Team" if is_builtin_default else "User")).strip(),
        "version": str(meta.get("version") or "1.0").strip(),
    }


def serialize_skill_markdown(skill: SkillDocument) -> str:
    frontmatter: Dict[str, Any] = {
        "name": skill.name,
        "slug": skill.slug,
        "description": skill.description,
        "category": skill.category,
        "tags": skill.tags,
        "triggers": skill.triggers,
        "questions": skill.questions,
        "enabled": skill.enabled,
        "is_global": skill.is_global,
        "is_shared": skill.is_shared,
        "is_builtin": skill.is_builtin,
        "author": skill.author,
        "version": skill.version,
    }
    if skill.project_id:
        frontmatter["project_id"] = skill.project_id

    yaml_str = yaml.safe_dump(
        frontmatter,
        allow_unicode=True,
        sort_keys=False,
        default_flow_style=False,
    ).strip()
    body = (skill.content or "").strip()
    return f"---\n{yaml_str}\n---\n\n{body}\n"


def _tokenize(text: str) -> List[str]:
    words = re.findall(r"[a-zа-яё0-9]{3,}", (text or "").lower())
    return words


def _stem(word: str) -> str:
    if len(word) >= 6:
        return word[:5]
    if len(word) >= 5:
        return word[:4]
    return word


class SkillsService:
    """Manages the SKILL.md library, CRUD operations, and automatic skill retrieval for the AI agent."""

    def __init__(self, skills_dir: Optional[str] = None):
        if skills_dir:
            self._base_dir = Path(skills_dir)
        else:
            env_dir = os.getenv("WREN_SKILLS_DIR")
            if env_dir:
                self._base_dir = Path(env_dir)
            else:
                # Default to wren-ai-service/skills
                self._base_dir = Path(__file__).resolve().parents[4] / "skills"

        self._builtin_dir = self._base_dir / "builtin"
        self._shared_dir = self._base_dir / "shared"
        self._custom_dir = self._base_dir / "custom"
        self._state_file = self._base_dir / "state.json"

        self._builtin_dir.mkdir(parents=True, exist_ok=True)
        self._shared_dir.mkdir(parents=True, exist_ok=True)
        self._custom_dir.mkdir(parents=True, exist_ok=True)

        self._skills: Dict[str, SkillDocument] = {}
        self.reload()

    def _load_state_overrides(self) -> Dict[str, Any]:
        if not self._state_file.exists():
            return {}
        try:
            return json.loads(self._state_file.read_text(encoding="utf-8"))
        except Exception as e:
            logger.warning(f"Failed to read skills state.json: {e}")
            return {}

    def _save_state_overrides(self, state: Dict[str, Any]) -> None:
        try:
            self._state_file.write_text(
                json.dumps(state, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        except Exception as e:
            logger.warning(f"Failed to write skills state.json: {e}")

    def reload(self) -> None:
        state = self._load_state_overrides()
        deleted_slugs = set(state.get("deleted", []))
        overrides = state.get("overrides", {})

        loaded: Dict[str, SkillDocument] = {}

        for folder, is_builtin_flag in [
            (self._builtin_dir, True),
            (self._shared_dir, False),
            (self._custom_dir, False),
        ]:
            if not folder.exists():
                continue
            for skill_md_path in sorted(folder.glob("*/SKILL.md")):
                fallback_slug = skill_md_path.parent.name
                try:
                    raw = skill_md_path.read_text(encoding="utf-8")
                    parsed = parse_skill_markdown(
                        raw,
                        fallback_slug=fallback_slug,
                        is_builtin_default=is_builtin_flag,
                    )
                    slug = parsed["slug"]
                    if slug in deleted_slugs:
                        continue
                    stat = skill_md_path.stat()
                    mtime_iso = datetime.fromtimestamp(
                        stat.st_mtime, tz=timezone.utc
                    ).isoformat()

                    if slug in overrides:
                        for k, v in overrides[slug].items():
                            if k in parsed and v is not None:
                                parsed[k] = v

                    doc = SkillDocument(
                        **parsed,
                        raw_markdown="",
                        created_at=mtime_iso,
                        updated_at=mtime_iso,
                    )
                    doc.raw_markdown = serialize_skill_markdown(doc)
                    loaded[slug] = doc
                except Exception as e:
                    logger.error(f"Error loading skill from {skill_md_path}: {e}")

        self._skills = loaded
        logger.info(f"Loaded {len(self._skills)} skills from {self._base_dir}")

    def list_skills(
        self,
        project_id: Optional[str] = None,
        include_disabled: bool = True,
    ) -> List[SkillDocument]:
        results: List[SkillDocument] = []
        for skill in self._skills.values():
            if not include_disabled and not skill.enabled:
                continue
            if (
                project_id
                and not skill.is_shared
                and not skill.is_builtin
                and skill.project_id
                and str(skill.project_id) != str(project_id)
            ):
                continue
            results.append(skill)

        results.sort(
            key=lambda s: (
                0 if s.is_global else 1,
                0 if s.is_builtin else 1,
                s.name.lower(),
            )
        )
        return results

    def get_skill(self, skill_id: str) -> Optional[SkillDocument]:
        slug = slugify(skill_id)
        return self._skills.get(skill_id) or self._skills.get(slug)

    def save_skill(self, request: SkillCreateOrUpdateRequest) -> SkillDocument:
        existing = None
        if request.id:
            existing = self.get_skill(request.id)
        if not existing and request.slug:
            existing = self.get_skill(request.slug)

        now_iso = datetime.now(timezone.utc).isoformat()

        if request.raw_markdown and request.raw_markdown.strip():
            parsed = parse_skill_markdown(
                request.raw_markdown,
                fallback_slug=request.slug or (existing.slug if existing else None),
                is_builtin_default=existing.is_builtin if existing else False,
            )
        else:
            base = existing.model_dump() if existing else {}
            name = (
                request.name
                or base.get("name")
                or request.slug
                or "New Analytical Skill"
            )
            slug = slugify(
                request.slug or request.id or base.get("slug") or name
            )
            parsed = {
                "id": slug,
                "slug": slug,
                "name": name,
                "description": (
                    request.description
                    if request.description is not None
                    else base.get("description", "")
                ),
                "category": (
                    request.category
                    if request.category is not None
                    else base.get("category", "General")
                ),
                "tags": (
                    request.tags
                    if request.tags is not None
                    else base.get("tags", [])
                ),
                "triggers": (
                    request.triggers
                    if request.triggers is not None
                    else base.get("triggers", [])
                ),
                "questions": (
                    request.questions
                    if request.questions is not None
                    else base.get("questions", [])
                ),
                "content": (
                    request.content
                    if request.content is not None
                    else base.get("content", "")
                ),
                "enabled": (
                    request.enabled
                    if request.enabled is not None
                    else base.get("enabled", True)
                ),
                "is_global": (
                    request.is_global
                    if request.is_global is not None
                    else base.get("is_global", False)
                ),
                "is_shared": (
                    request.is_shared
                    if request.is_shared is not None
                    else base.get("is_shared", True)
                ),
                "is_builtin": base.get("is_builtin", False),
                "project_id": (
                    str(request.project_id)
                    if request.project_id is not None
                    else base.get("project_id")
                ),
                "author": (
                    request.author
                    if request.author is not None
                    else base.get("author", "User")
                ),
                "version": (
                    request.version
                    if request.version is not None
                    else base.get("version", "1.0")
                ),
            }

        # Apply explicit field overrides even if raw_markdown was passed
        if request.name is not None:
            parsed["name"] = request.name
        if request.description is not None:
            parsed["description"] = request.description
        if request.category is not None:
            parsed["category"] = request.category
        if request.tags is not None:
            parsed["tags"] = request.tags
        if request.triggers is not None:
            parsed["triggers"] = request.triggers
        if request.questions is not None:
            parsed["questions"] = request.questions
        if request.content is not None and not request.raw_markdown:
            parsed["content"] = request.content
        if request.enabled is not None:
            parsed["enabled"] = request.enabled
        if request.is_global is not None:
            parsed["is_global"] = request.is_global
        if request.is_shared is not None:
            parsed["is_shared"] = request.is_shared
        if request.project_id is not None:
            parsed["project_id"] = str(request.project_id)
        if request.author is not None:
            parsed["author"] = request.author
        if request.version is not None:
            parsed["version"] = request.version

        slug = parsed["slug"]
        doc = SkillDocument(
            **parsed,
            raw_markdown="",
            created_at=existing.created_at if existing else now_iso,
            updated_at=now_iso,
        )
        doc.raw_markdown = serialize_skill_markdown(doc)

        # Determine target folder
        if doc.is_builtin:
            target_dir = self._builtin_dir / slug
        elif doc.is_shared:
            target_dir = self._shared_dir / slug
        else:
            target_dir = self._custom_dir / slug

        target_dir.mkdir(parents=True, exist_ok=True)
        (target_dir / "SKILL.md").write_text(doc.raw_markdown, encoding="utf-8")

        # Update state.json so it's not marked deleted
        state = self._load_state_overrides()
        deleted = set(state.get("deleted", []))
        if slug in deleted:
            deleted.discard(slug)
            state["deleted"] = sorted(deleted)
            self._save_state_overrides(state)

        self._skills[slug] = doc
        return doc

    def import_skill(self, request: SkillImportRequest) -> SkillDocument:
        parsed = parse_skill_markdown(request.raw_markdown, is_builtin_default=False)
        parsed["is_shared"] = request.is_shared
        if request.project_id:
            parsed["project_id"] = str(request.project_id)
        return self.save_skill(SkillCreateOrUpdateRequest(**parsed))

    def delete_skill(self, skill_id: str) -> bool:
        skill = self.get_skill(skill_id)
        if not skill:
            return False

        slug = skill.slug
        for folder in [self._shared_dir, self._custom_dir, self._builtin_dir]:
            skill_file = folder / slug / "SKILL.md"
            if skill_file.exists():
                try:
                    skill_file.unlink()
                    skill_file.parent.rmdir()
                except Exception:
                    pass

        state = self._load_state_overrides()
        deleted = set(state.get("deleted", []))
        deleted.add(slug)
        state["deleted"] = sorted(deleted)
        self._save_state_overrides(state)

        self._skills.pop(slug, None)
        return True

    def match_skills(
        self,
        query: str,
        project_id: Optional[str] = None,
        explicit_skill_ids: Optional[List[str]] = None,
        top_k: int = 3,
    ) -> List[SkillDocument]:
        """
        Select relevant skills for a user query using:
        1. Explicit skill IDs passed from UI or @skill-slug mentions in query
        2. Global active skills (is_global=True and enabled=True)
        3. Trigger phrases, example questions, tags, and semantic/lexical stem overlap
        """
        available = self.list_skills(project_id=project_id, include_disabled=True)
        by_slug = {s.slug: s for s in available}

        matched: List[SkillDocument] = []
        seen_slugs = set()

        def _add(skill: SkillDocument):
            if skill.slug not in seen_slugs:
                seen_slugs.add(skill.slug)
                matched.append(skill)

        # 1. Explicit skill IDs from request
        for sid in explicit_skill_ids or []:
            s = by_slug.get(sid) or by_slug.get(slugify(sid))
            if s:
                _add(s)

        # Also check @slug or /slug mentions inside the query text
        query_lower = (query or "").lower()
        for slug, s in by_slug.items():
            if f"@{slug}" in query_lower or f"/{slug}" in query_lower:
                _add(s)

        # 2. Global enabled skills
        for s in available:
            if s.enabled and s.is_global:
                _add(s)

        # 3. Automatic trigger & contextual matching among enabled skills
        query_tokens = _tokenize(query_lower)
        query_stems = {_stem(t) for t in query_tokens}

        scored: List[tuple[float, SkillDocument]] = []
        for s in available:
            if not s.enabled or s.slug in seen_slugs:
                continue

            score = 0.0
            # Direct trigger substring match
            for trig in s.triggers:
                t_low = trig.lower().strip()
                if not t_low:
                    continue
                if t_low in query_lower:
                    score += 5.0
                else:
                    trig_stems = {_stem(w) for w in _tokenize(t_low)}
                    if trig_stems and trig_stems.issubset(query_stems):
                        score += 3.5

            # Tag match
            for tag in s.tags:
                tag_low = tag.lower().strip()
                if tag_low and (tag_low in query_lower or _stem(tag_low) in query_stems):
                    score += 2.0

            # Example questions & description stem overlap
            corpus_tokens = _tokenize(
                " ".join([s.name, s.description, " ".join(s.questions)])
            )
            corpus_stems = {_stem(w) for w in corpus_tokens}
            overlap = len(query_stems.intersection(corpus_stems))
            if overlap >= 2:
                score += overlap * 0.8

            if score >= 2.0:
                scored.append((score, s))

        scored.sort(key=lambda pair: pair[0], reverse=True)
        for _, s in scored[:top_k]:
            _add(s)

        return matched

    def format_skills_as_instructions(
        self, skills: List[SkillDocument]
    ) -> List[Dict[str, str]]:
        """
        Convert matched skills into WrenAI instruction dicts so all existing SQL pipelines
        (intent_classification, sql_generation_reasoning, sql_generation, sql_correction)
        automatically apply them.
        """
        formatted = []
        for skill in skills:
            text = (
                f"[ACTIVE SKILL: {skill.name} ({skill.slug})]\n"
                f"Description: {skill.description}\n"
                f"{skill.content.strip()}"
            )
            formatted.append(
                {
                    "instruction": text,
                    "question": "",
                    "instruction_id": f"skill:{skill.slug}",
                }
            )
        return formatted

    def format_skills_prompt_block(self, skills: List[SkillDocument]) -> str:
        """Format matched skills as a Markdown block for Answer, Chart, and HTML Dashboard generators."""
        if not skills:
            return ""
        blocks = ["### ACTIVE ANALYTICAL SKILLS ###"]
        for idx, skill in enumerate(skills, start=1):
            blocks.append(
                f"#### Skill {idx}: {skill.name} (`{skill.slug}`)\n"
                f"{skill.description}\n\n"
                f"{skill.content.strip()}"
            )
        return "\n\n".join(blocks)
