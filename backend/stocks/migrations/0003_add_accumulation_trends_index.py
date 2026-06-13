from django.db import migrations

class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ('stocks', '0002_add_accumulation_indexes'),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
            DO $$
            BEGIN
                IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'daily_cumulative_accumulation') THEN
                    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dca_trends ON daily_cumulative_accumulation (symbol, entity_id, transaction_date);
                END IF;
            END
            $$;
            """,
            reverse_sql="""
            DO $$
            BEGIN
                IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'daily_cumulative_accumulation') THEN
                    DROP INDEX IF EXISTS idx_dca_trends;
                END IF;
            END
            $$;
            """
        ),
    ]
