-- O resumo do dia e o lembrete de checkout passam a correr no worker Nest.
-- Este ficheiro só remove os jobs que chamavam as Edge Functions.
-- Não agenda nada no lugar. Não foi executado contra a base de produção por este repositório.

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN ('send-daily-digest-schedule', 'send-checkout-reminders-daily');
