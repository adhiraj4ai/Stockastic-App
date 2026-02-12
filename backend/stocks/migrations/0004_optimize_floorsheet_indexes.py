from django.db import migrations

class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ('stocks', '0003_add_accumulation_trends_index'),
    ]

    operations = [
        migrations.RunSQL(
            sql="CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_floorsheet_date_symbol ON daily_floorsheet (transaction_date, symbol);",
            reverse_sql="DROP INDEX IF EXISTS idx_floorsheet_date_symbol;"
        ),
        migrations.RunSQL(
            sql="CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_floorsheet_buyer_date ON daily_floorsheet (buyer_id, transaction_date);",
            reverse_sql="DROP INDEX IF EXISTS idx_floorsheet_buyer_date;"
        ),
        migrations.RunSQL(
            sql="CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_floorsheet_seller_date ON daily_floorsheet (seller_id, transaction_date);",
            reverse_sql="DROP INDEX IF EXISTS idx_floorsheet_seller_date;"
        ),
    ]
