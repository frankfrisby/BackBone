import fetch from "node-fetch";

/**
 * Oura Ring API Service
 * https://cloud.ouraring.com/v2/docs
 * Requires Personal Access Token from Oura dashboard
 */

export const getOuraConfig = () => {
  const accessToken = process.env.OURA_ACCESS_TOKEN;

  return {
    accessToken,
    ready: Boolean(accessToken),
    baseUrl: "https://api.ouraring.com/v2"
  };
};

const buildHeaders = (config) => ({
  Authorization: `Bearer ${config.accessToken}`,
  "Content-Type": "application/json"
});

const fetchJson = async (url, options) => {
  const response = await fetch(url, options);
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Oura request failed: ${response.status}`);
  }
  return response.json();
};

/**
 * Fetch personal info from Oura
 */
export const fetchPersonalInfo = async (config) => {
  if (!config.ready) return null;

  const url = `${config.baseUrl}/usercollection/personal_info`;
  return fetchJson(url, { headers: buildHeaders(config) });
};

/**
 * Fetch daily sleep data
 * @param {string} startDate - YYYY-MM-DD format
 * @param {string} endDate - YYYY-MM-DD format (optional)
 */
export const fetchDailySleep = async (config, startDate, endDate) => {
  if (!config.ready) return null;

  let url = `${config.baseUrl}/usercollection/daily_sleep?start_date=${startDate}`;
  if (endDate) {
    url += `&end_date=${endDate}`;
  }

  return fetchJson(url, { headers: buildHeaders(config) });
};

/**
 * Fetch sleep periods (detailed sleep data)
 */
export const fetchSleepPeriods = async (config, startDate, endDate) => {
  if (!config.ready) return null;

  let url = `${config.baseUrl}/usercollection/sleep?start_date=${startDate}`;
  if (endDate) {
    url += `&end_date=${endDate}`;
  }

  return fetchJson(url, { headers: buildHeaders(config) });
};

/**
 * Fetch daily activity data
 */
export const fetchDailyActivity = async (config, startDate, endDate) => {
  if (!config.ready) return null;

  let url = `${config.baseUrl}/usercollection/daily_activity?start_date=${startDate}`;
  if (endDate) {
    url += `&end_date=${endDate}`;
  }

  return fetchJson(url, { headers: buildHeaders(config) });
};

/**
 * Fetch daily readiness score
 */
export const fetchDailyReadiness = async (config, startDate, endDate) => {
  if (!config.ready) return null;

  let url = `${config.baseUrl}/usercollection/daily_readiness?start_date=${startDate}`;
  if (endDate) {
    url += `&end_date=${endDate}`;
  }

  return fetchJson(url, { headers: buildHeaders(config) });
};

/**
 * Fetch heart rate data
 */
export const fetchHeartRate = async (config, startDate, endDate) => {
  if (!config.ready) return null;

  let url = `${config.baseUrl}/usercollection/heartrate?start_datetime=${startDate}T00:00:00`;
  if (endDate) {
    url += `&end_datetime=${endDate}T23:59:59`;
  }

  return fetchJson(url, { headers: buildHeaders(config) });
};

/**
 * Get today's date in YYYY-MM-DD format
 */
const getToday = () => {
  return new Date().toISOString().split("T")[0];
};

/**
 * Get date N days ago in YYYY-MM-DD format
 */
const getDaysAgo = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split("T")[0];
};

/**
 * Build comprehensive Oura health summary for BACKBONE
 */
export const buildOuraHealthSummary = async (config) => {
  if (!config.ready) {
    return null;
  }

  const today = getToday();
  const weekAgo = getDaysAgo(7);

  try {
    const [personalInfo, sleep, readiness, activity] = await Promise.all([
      fetchPersonalInfo(config),
      fetchDailySleep(config, weekAgo, today),
      fetchDailyReadiness(config, weekAgo, today),
      fetchDailyActivity(config, weekAgo, today)
    ]);

    // Get most recent day's data
    const latestSleep = sleep?.data?.[sleep.data.length - 1];
    const latestReadiness = readiness?.data?.[readiness.data.length - 1];
    const latestActivity = activity?.data?.[activity.data.length - 1];

    // Calculate 7-day averages
    const avgSleepScore = sleep?.data?.length
      ? Math.round(sleep.data.reduce((sum, d) => sum + (d.score || 0), 0) / sleep.data.length)
      : null;
    const avgReadinessScore = readiness?.data?.length
      ? Math.round(readiness.data.reduce((sum, d) => sum + (d.score || 0), 0) / readiness.data.length)
      : null;
    const avgActivityScore = activity?.data?.length
      ? Math.round(activity.data.reduce((sum, d) => sum + (d.score || 0), 0) / activity.data.length)
      : null;

    return {
      connected: true,
      age: personalInfo?.age,
      weight: personalInfo?.weight,
      height: personalInfo?.height,
      biologicalSex: personalInfo?.biological_sex,
      today: {
        sleepScore: latestSleep?.score || null,
        readinessScore: latestReadiness?.score || null,
        activityScore: latestActivity?.score || null,
        totalSleepHours: latestSleep?.contributors?.total_sleep
          ? (latestSleep.contributors.total_sleep / 3600).toFixed(1)
          : null,
        steps: latestActivity?.steps || null,
        activeCalories: latestActivity?.active_calories || null,
        restingHeartRate: latestReadiness?.contributors?.resting_heart_rate || null
      },
      weekAverage: {
        sleepScore: avgSleepScore,
        readinessScore: avgReadinessScore,
        activityScore: avgActivityScore
      },
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error("Oura health summary failed:", error.message);
    return { connected: false, error: error.message };
  }
};

/**
 * Get health status color based on score
 */
export const getHealthScoreColor = (score) => {
  if (!score) return "#64748b";
  if (score >= 85) return "#22c55e";
  if (score >= 70) return "#eab308";
  return "#f97316";
};

/**
 * Get health status text
 */
export const getHealthStatus = (score) => {
  if (!score) return "No data";
  if (score >= 85) return "Optimal";
  if (score >= 70) return "Good";
  if (score >= 50) return "Fair";
  return "Pay Attention";
};
