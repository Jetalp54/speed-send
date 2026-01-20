from celery import Celery
from app.config import settings

# Create Celery app
celery_app = Celery(
    'gmail_saas',
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=['app.tasks', 'app.tasks_powermta', 'app.tasks_v2', 'app.tasks_drafts_v2', 'app.tasks_scheduled_resume']
)

# Configure Celery for optimal performance with reasonable limits
celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    task_track_started=True,
    # Set reasonable time limits for tasks
    task_soft_time_limit=300,  # 5 minutes soft limit
    task_time_limit=600,  # 10 minutes hard limit
    broker_connection_retry_on_startup=True,
    # Optimized settings for high throughput
    task_acks_late=True,  # Acknowledge after task completion
    task_reject_on_worker_lost=True,  # Requeue if worker dies
    task_compression='gzip',  # Use compression for large messages
    # Optimized concurrency settings
    worker_prefetch_multiplier=100,  # Reasonable prefetch
    worker_concurrency=100,  # 100 concurrent workers for maximum speed
    worker_pool='threads',  # Use threads for I/O bound tasks
    worker_disable_rate_limits=True,  # DISABLE rate limiting for maximum speed
    task_ignore_result=False,  # Keep results for monitoring
    task_store_eager_result=False,  # Don't store immediately
    worker_max_tasks_per_child=1000,  # Restart worker after 1000 tasks
    # Add monitoring settings
    worker_send_task_events=True,  # Enable task events
    task_send_sent_event=True,  # Track when tasks are sent
)

# Task routes
celery_app.conf.task_routes = {
    'app.tasks.send_campaign_emails': {'queue': 'email_queue'},
    'app.tasks.send_bulk_from_single_sender': {'queue': 'email_queue'},
    'app.tasks.send_single_email': {'queue': 'email_queue'},
    'app.tasks.sync_workspace_users': {'queue': 'sync_queue'},
    'app.daily_limits.reset_daily_limits': {'queue': 'maintenance_queue'},
}

# Celery Beat schedule for daily limit reset
from celery.schedules import crontab

celery_app.conf.beat_schedule = {
    'reset-daily-limits': {
        'task': 'app.daily_limits.reset_daily_limits',
        'schedule': crontab(hour=0, minute=0),  # Every day at midnight
    },
}

