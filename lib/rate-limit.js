async function hit(sql, bucketKey, limit, windowMinutes = 15) {
  const rows = await sql`
    insert into auth_rate_limits (bucket_key, window_started, request_count, updated_at)
    values (${bucketKey}, now(), 1, now())
    on conflict (bucket_key) do update set
      request_count = case
        when auth_rate_limits.window_started < now() - make_interval(mins => ${windowMinutes}) then 1
        else auth_rate_limits.request_count + 1
      end,
      window_started = case
        when auth_rate_limits.window_started < now() - make_interval(mins => ${windowMinutes}) then now()
        else auth_rate_limits.window_started
      end,
      updated_at = now()
    returning request_count`;
  return Number(rows[0]?.request_count || 0) > limit;
}

module.exports = { hit };
