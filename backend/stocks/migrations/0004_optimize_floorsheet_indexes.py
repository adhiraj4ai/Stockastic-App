from django.db import migrations

class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ('stocks', '0003_add_accumulation_trends_index'),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
            DO $$
            BEGIN
                IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'daily_floorsheet') THEN
                    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_floorsheet_date_symbol ON daily_floorsheet (transaction_date, symbol);
                END IF;
            END
            $$;
            """,
            reverse_sql="""
            DO $$
            BEGIN
                IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'daily_floorsheet') THEN
                    DROP INDEX IF EXISTS idx_floorsheet_date_symbol;
                END IF;
            END
            $$;
            """
        ),
        migrations.RunSQL(
            sql="""
            DO $$
            BEGIN
                IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'daily_floorsheet') THEN
                    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_floorsheet_buyer_date ON daily_floorsheet (buyer_id, transaction_date);
                END IF;
            END
            $$;
            """,
            reverse_sql="""
            DO $$
            BEGIN
                IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'daily_floorsheet') THEN
                    DROP INDEX IF EXISTS idx_floorsheet_buyer_date;
                END IF;
            END
            $$;
            """
        ),
        migrations.RunSQL(
            sql="""
            DO $$
            BEGIN
                IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'daily_floorsheet') THEN
                    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_floorsheet_seller_date ON daily_floorsheet (seller_id, transaction_date);
                END IF;
            END
            $$;
            """,
            reverse_sql="""
            DO $$
            BEGIN
                IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'daily_floorsheet') THEN
                    DROP INDEX IF EXISTS idx_floorsheet_seller_date;
                END IF;
            END
            $$;
            """
        ),
    ]
