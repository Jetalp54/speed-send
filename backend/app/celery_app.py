from celery import Celery
from app.config import settings

# Create Celery app
celery_app = Celery(
    'gmail_saas',
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        'app.tasks', 
        'app.tasks_powermta', 
        'app.tasks_v2', 
        'app.tasks_drafts_v2', 
        'app.tasks_scheduled_resume', 
        'app.tasks_maintenance',
        'app.tasks_enterprise',
        'app.services.tracking'
    ]
)

# ... existing config ...

# Celery Beat schedule for daily limit reset and maintenance
from celery.schedules import crontab

celery_app.conf.beat_schedule = {
    'reset-daily-limits': {
        'task': 'app.daily_limits.reset_daily_limits',
        'schedule': crontab(hour=0, minute=0),  # Every day at midnight
    },
    'check-stuck-campaigns': {
        'task': 'app.tasks_maintenance.check_stuck_campaigns',
        'schedule': 300.0,  # Every 5 minutes (300 seconds)
    },
    'sync-analytics': {
        'task': 'app.tasks_enterprise.update_analytics_task',
        'schedule': 30.0,  # Every 30 seconds
    },
}

