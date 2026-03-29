DROP INDEX IF EXISTS idx_social_profiles_protocol_ranking_desc;
DROP INDEX IF EXISTS idx_social_posts_protocol_ranking_desc;
DROP INDEX IF EXISTS idx_social_votes_profile_time_desc;
DROP INDEX IF EXISTS idx_social_votes_post_time_desc;
DROP INDEX IF EXISTS idx_social_votes_protocol_time_desc;
DROP INDEX IF EXISTS idx_social_stats_protocol_kind_day;

DROP TABLE IF EXISTS social_stats_daily;
DROP TABLE IF EXISTS social_votes;
DROP TABLE IF EXISTS social_posts;
DROP TABLE IF EXISTS social_profiles;

