from django.core.management.base import BaseCommand

from stocks.services import daily_plan as daily_plan_service


class Command(BaseCommand):
    help = "Manually build today's trading plan (same logic as the nightly Celery task)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--date", metavar="YYYY-MM-DD", default=None,
            help="Build the plan as-of this date instead of today.",
        )
        parser.add_argument(
            "--no-notify", action="store_true",
            help="Skip user notifications after building.",
        )

    def handle(self, *args, **options):
        import datetime
        from stocks.models import DataUploadLog

        as_of = None
        if options["date"]:
            try:
                as_of = datetime.date.fromisoformat(options["date"])
            except ValueError:
                self.stderr.write(self.style.ERROR(f"Invalid date: {options['date']}"))
                return

        self.stdout.write("Building daily trading plan…")
        try:
            plan = daily_plan_service.build_daily_plan(as_of=as_of)
        except Exception as exc:
            DataUploadLog.objects.create(
                file_name="daily_plan", upload_type="PLAN", status="FAILED",
                error_message=str(exc),
            )
            self.stderr.write(self.style.ERROR(f"Plan generation failed: {exc}"))
            return

        pick_count = len(plan.payload.get("picks", []))
        self.stdout.write(self.style.SUCCESS(
            f"Plan built for {plan.date} — {pick_count} pick(s)."
        ))

        if options["no_notify"]:
            return

        self.stdout.write("Sending notifications…")
        from django.contrib.auth.models import User
        from stocks.services.notification_service import create_notification
        from users.models import TierPermission

        entitled = set(
            TierPermission.objects.filter(permission_name="access_daily_plan")
            .values_list("user_id", flat=True)
        )
        notified = 0
        for user in User.objects.filter(id__in=entitled, is_active=True):
            try:
                create_notification(
                    user=user,
                    notification_type="DAILY_PLAN_READY",
                    title="Tomorrow's plan is ready",
                    message=f"{pick_count} pick(s) for {plan.date}",
                    data={"plan_date": plan.date.isoformat()},
                )
                notified += 1
            except Exception as exc:
                self.stderr.write(f"  notify {user.username}: {exc}")

        self.stdout.write(self.style.SUCCESS(f"Notified {notified} user(s)."))
