import tempfile
from pathlib import Path

from src.web.v1.services.skills import (
    SkillCreateOrUpdateRequest,
    SkillImportRequest,
    SkillsService,
    parse_skill_markdown,
    serialize_skill_markdown,
)


def test_parse_and_serialize_skill_markdown():
    raw = """---
name: Custom Churn Analysis
slug: custom-churn
description: Customer churn analysis methodology
category: Customer Analytics
tags:
  - churn
  - retention
triggers:
  - отток
  - churn rate
questions:
  - Какой уровень оттока клиентов?
enabled: true
is_global: false
is_shared: true
author: Test Analyst
version: "1.2"
---

## Churn Rules
1. Group customers by last activity month.
"""
    parsed = parse_skill_markdown(raw)
    assert parsed["slug"] == "custom-churn"
    assert parsed["name"] == "Custom Churn Analysis"
    assert "отток" in parsed["triggers"]
    assert "Group customers" in parsed["content"]


def test_builtin_skills_loaded_and_matched():
    service = SkillsService()
    all_skills = service.list_skills()
    slugs = {s.slug for s in all_skills}
    assert "rfm-segmentation" in slugs
    assert "cohort-retention" in slugs
    assert "abc-xyz-analysis" in slugs
    assert "sales-forecasting" in slugs
    assert "executive-bi-dashboard" in slugs
    assert "anomaly-detection" in slugs

    # Match by trigger in Russian
    rfm_matches = service.match_skills("Проведи RFM анализ клиентов по выручке")
    assert any(s.slug == "rfm-segmentation" for s in rfm_matches)

    # Match forecasting skill
    forecast_matches = service.match_skills(
        "Привет, как у меня дела будут на следующей неделе по продажам?"
    )
    assert any(s.slug == "sales-forecasting" for s in forecast_matches)

    # Match by explicit skill_ids
    explicit_matches = service.match_skills(
        "Покажи продажи", explicit_skill_ids=["abc-xyz-analysis"]
    )
    assert explicit_matches[0].slug == "abc-xyz-analysis"

    # Match by @slug mention in query
    mention_matches = service.match_skills("Сделай анализ @cohort-retention по месяцам")
    assert any(s.slug == "cohort-retention" for s in mention_matches)


def test_crud_and_import_skills_in_temp_dir():
    with tempfile.TemporaryDirectory() as tmpdir:
        service = SkillsService(skills_dir=tmpdir)
        assert service.list_skills() == []

        created = service.save_skill(
            SkillCreateOrUpdateRequest(
                name="Маржинальность товаров",
                description="Анализ маржи по категориям",
                category="Finance",
                tags=["margin", "profit"],
                triggers=["маржа", "прибыльность"],
                questions=["Какая маржа по категориям?"],
                content="## Правила расчёта маржи\nИспользуй SUM(revenue - cost).",
                enabled=True,
                is_global=False,
                is_shared=True,
            )
        )
        assert created.slug == "marzhinalnost-tovarov"
        assert (Path(tmpdir) / "shared" / created.slug / "SKILL.md").exists()

        # Import SKILL.md
        imported = service.import_skill(
            SkillImportRequest(
                raw_markdown="""---
name: Imported Funnel Skill
slug: funnel-conversion
description: Conversion funnel rules
triggers:
  - воронка
  - конверсия
---
## Funnel Steps
Calculate conversion between stages.
""",
                is_shared=True,
            )
        )
        assert imported.slug == "funnel-conversion"
        assert len(service.list_skills()) == 2

        matched = service.match_skills("Покажи конверсию и воронку продаж")
        assert any(s.slug == "funnel-conversion" for s in matched)

        # Delete skill
        assert service.delete_skill("funnel-conversion") is True
        assert service.get_skill("funnel-conversion") is None
