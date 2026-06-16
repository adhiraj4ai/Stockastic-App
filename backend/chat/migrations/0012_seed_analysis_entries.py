from django.db import migrations


def seed_entries(apps, schema_editor):
    from chat.analysis_seed import seed_entry_fields

    CompanyChatSummary = apps.get_model("chat", "CompanyChatSummary")
    CompanyAnalysisEntry = apps.get_model("chat", "CompanyAnalysisEntry")

    for summary_row in CompanyChatSummary.objects.all().iterator():
        fields = seed_entry_fields(summary_row.summary)
        if fields is None:
            continue
        entry = CompanyAnalysisEntry.objects.create(
            user_id=summary_row.user_id,
            symbol=summary_row.symbol,
            source_message_id=summary_row.last_message_id,
            **fields,
        )
        # Preserve the original timeline position (created_at is auto_now_add).
        CompanyAnalysisEntry.objects.filter(pk=entry.pk).update(
            created_at=summary_row.created_at
        )


class Migration(migrations.Migration):
    dependencies = [("chat", "0011_companyanalysisentry")]
    operations = [migrations.RunPython(seed_entries, migrations.RunPython.noop)]
