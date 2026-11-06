
const express = require("express");

const app = express();
const PORT = process.env.PORT || 8080;
const BASE_URL = "https://soccer.highlightly.net";

app.use(express.static(__dirname));

const cache = new Map();

const CACHE_TIMES = {
  matches: 60 * 1000,
  form: 5 * 60 * 1000,
  h2h: 30 * 60 * 1000,
  lineups: 15 * 60 * 1000,
  statistics: 5 * 60 * 1000,
  details: 5 * 60 * 1000,
  events: 60 * 1000
};

function validId(value) {
  return /^\d+$/.test(String(value || ""));
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(value + "T00:00:00Z");
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value;
}

function getArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.matches)) return data.matches;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

async function providerGet(path, cacheKey, cacheTime = 0) {
  const apiKey = process.env.HIGHLIGHTLY_API_KEY;

  if (!apiKey) {
    throw new Error("HIGHLIGHTLY_API_KEY is missing in Render environment");
  }

  if (cacheKey && cache.has(cacheKey)) {
    const saved = cache.get(cacheKey);

    if (Date.now() - saved.time < cacheTime) {
      return saved.data;
    }

    cache.delete(cacheKey);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(BASE_URL + path, {
      headers: {
        "x-rapidapi-key": apiKey
      },
      signal: controller.signal
    });

    const text = await response.text();
    let data;

    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { message: text };
    }

    if (!response.ok) {
      const error = new Error(
        data.message || data.error || `Highlightly error ${response.status}`
      );
      error.status = response.status;
      error.details = data;
      throw error;
    }

    if (cacheKey && cacheTime > 0) {
      cache.set(cacheKey, {
        time: Date.now(),
        data
      });
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function sendError(res, error) {
  console.error("FBIS error:", error.message);

  res.status(error.status || 500).json({
    error: error.message || "Unexpected server error",
    details: error.details || null
  });
}

// HEALTH CHECK
app.get("/health", (req, res) => {
  res.json({
    system: "FBIS",
    status: "OK",
    provider: "Highlightly",
    time: new Date().toISOString()
  });
});

// HOME
app.get("/", (req, res) => {
  res.json({
    system: "Football Betting Intelligence System",
    version: "2.0",
    status: "Backend online",
    provider: "Highlightly"
  });
});

// FIXTURES
async function getFootballMatches(date, offset = 0, limit = 100) {
  const params = new URLSearchParams({
    date,
    timezone: "Africa/Nairobi",
    limit: String(limit),
    offset: String(offset)
  });

  return providerGet(
    `/matches?${params}`,
    `matches:${date}:${offset}:${limit}`,
    CACHE_TIMES.matches
  );
}

// RAW FIXTURES
app.get("/fixtures", async (req, res) => {
  const date = req.query.date;

  if (!validDate(date)) {
    return res.status(400).json({
      error: "Use date format YYYY-MM-DD"
    });
  }

  try {
    const data = await getFootballMatches(date);
    res.json(data);
  } catch (error) {
    sendError(res, error);
  }
});

// DASHBOARD MATCHES
app.get("/matches", async (req, res) => {
  const date = req.query.date;
  const offset = Number(req.query.offset || 0);
  const limit = Math.min(Number(req.query.limit || 100), 100);

  if (!validDate(date)) {
    return res.status(400).json({
      error: "Use date format YYYY-MM-DD"
    });
  }

  if (!Number.isInteger(offset) || offset < 0 ||
      !Number.isInteger(limit) || limit < 1) {
    return res.status(400).json({
      error: "Invalid pagination values"
    });
  }

  try {
    const data = await getFootballMatches(date, offset, limit);

    const matches = getArray(data).map(item => ({
      id: item.id,
      match: `${item.homeTeam?.name || "Unknown"} vs ${item.awayTeam?.name || "Unknown"}`,
      home: item.homeTeam?.name || "Unknown",
      away: item.awayTeam?.name || "Unknown",
      league: item.league?.name || "Unknown league",
      country: item.country?.name || "Unknown country",
      date: item.date || null,
      status: item.state?.description || "Unknown",
      score: item.state?.score?.current || "Not available",
      homeTeamId: item.homeTeam?.id || null,
      awayTeamId: item.awayTeam?.id || null,
      leagueId: item.league?.id || null
    }));

    const total = data.pagination?.totalCount ?? matches.length;

    res.json({
      date,
      totalMatches: matches.length,
      providerTotal: total,
      offset,
      limit,
      hasMore: offset + matches.length < total,
      plan: data.plan || null,
      matches
    });
  } catch (error) {
    sendError(res, error);
  }
});

// TEAM RECENT FORM
app.get("/team-form/:teamId", async (req, res) => {
  const teamId = req.params.teamId;

  if (!validId(teamId)) {
    return res.status(400).json({ error: "Invalid team ID" });
  }

  try {
    const data = await providerGet(
      `/last-five-games?teamId=${teamId}`,
      `form:${teamId}`,
      CACHE_TIMES.form
    );

    res.json(data);
  } catch (error) {
    sendError(res, error);
  }
});

// HEAD TO HEAD
app.get("/h2h", async (req, res) => {
  const { team1, team2 } = req.query;

  if (!validId(team1) || !validId(team2)) {
    return res.status(400).json({
      error: "Provide two valid team IDs"
    });
  }

  try {
    const params = new URLSearchParams({
      teamIdOne: team1,
      teamIdTwo: team2
    });

    const data = await providerGet(
      `/head-2-head?${params}`,
      `h2h:${team1}:${team2}`,
      CACHE_TIMES.h2h
    );

    res.json(data);
  } catch (error) {
    sendError(res, error);
  }
});

// CONFIRMED LINEUPS AND FORMATIONS
app.get("/lineups/:matchId", async (req, res) => {
  const matchId = req.params.matchId;

  if (!validId(matchId)) {
    return res.status(400).json({ error: "Invalid match ID" });
  }

  try {
    const data = await providerGet(
      `/lineups/${matchId}`,
      `lineups:${matchId}`,
      CACHE_TIMES.lineups
    );

    res.json({
      available: true,
      type: "Provider lineup data",
      homeTeam: data.homeTeam || null,
      awayTeam: data.awayTeam || null
    });
  } catch (error) {
    if (error.status === 404 || error.status === 400) {
      return res.json({
        available: false,
        message: "Lineups are not available for this match yet."
      });
    }

    sendError(res, error);
  }
});

// MATCH DETAILS: VENUE, WEATHER AND OTHER AVAILABLE DATA
app.get("/match-details/:matchId", async (req, res) => {
  const matchId = req.params.matchId;

  if (!validId(matchId)) {
    return res.status(400).json({ error: "Invalid match ID" });
  }

  try {
    const data = await providerGet(
      `/matches/${matchId}`,
      `details:${matchId}`,
      CACHE_TIMES.details
    );

    res.json({
      available: true,
      match: data
    });
  } catch (error) {
    sendError(res, error);
  }
});

// MATCH STATISTICS
app.get("/match-statistics/:matchId", async (req, res) => {
  const matchId = req.params.matchId;

  if (!validId(matchId)) {
    return res.status(400).json({ error: "Invalid match ID" });
  }

  try {
    const data = await providerGet(
      `/statistics/${matchId}`,
      `statistics:${matchId}`,
      CACHE_TIMES.statistics
    );

    res.json({
      available: true,
      statistics: data
    });
  } catch (error) {
    if (error.status === 404) {
      return res.json({
        available: false,
        message: "Match statistics are not available."
      });
    }

    sendError(res, error);
  }
});

// LIVE MATCH EVENTS
app.get("/events/:matchId", async (req, res) => {
  const matchId = req.params.matchId;

  if (!validId(matchId)) {
    return res.status(400).json({ error: "Invalid match ID" });
  }

  try {
    const data = await providerGet(
      `/events/${matchId}`,
      `events:${matchId}`,
      CACHE_TIMES.events
    );

    res.json({
      available: true,
      events: getArray(data)
    });
  } catch (error) {
    if (error.status === 404) {
      return res.json({
        available: false,
        events: [],
        message: "No match events available."
      });
    }

    sendError(res, error);
  }
});

// PLAYER AVAILABILITY
// Highlightly availability for injuries and suspensions
// has not been verified for this integration.
app.get("/player-availability/:matchId", (req, res) => {
  if (!validId(req.params.matchId)) {
    return res.status(400).json({ error: "Invalid match ID" });
  }

  res.json({
    available: false,
    injuries: null,
    suspensions: null,
    message:
      "Verified injury and suspension information is not currently available through this integration. Do not assume missing players are fit."
  });
});

// ANALYSIS HELPERS
function getTeamStats(matches, teamId) {
  let played = 0;
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  let homePlayed = 0;
  let awayPlayed = 0;
  let homeGoalsFor = 0;
  let awayGoalsFor = 0;

  for (const match of matches) {
    const score = match.state?.score?.current;
    if (!score) continue;

    const parts = score.split("-").map(x => Number(x.trim()));

    if (parts.length !== 2 || parts.some(x => !Number.isFinite(x))) {
      continue;
    }

    const isHome = Number(match.homeTeam?.id) === teamId;
    const isAway = Number(match.awayTeam?.id) === teamId;

    if (!isHome && !isAway) continue;

    const scored = isHome ? parts[0] : parts[1];
    const conceded = isHome ? parts[1] : parts[0];

    played++;
    goalsFor += scored;
    goalsAgainst += conceded;

    if (isHome) {
      homePlayed++;
      homeGoalsFor += scored;
    } else {
      awayPlayed++;
      awayGoalsFor += scored;
    }

    if (scored > conceded) wins++;
    else if (scored === conceded) draws++;
    else losses++;
  }

  const points = wins * 3 + draws;

  return {
    played,
    wins,
    draws,
    losses,
    points,
    pointsPerGame: played ? points / played : 0,
    averageGoalsScored: played ? goalsFor / played : 0,
    averageGoalsConceded: played ? goalsAgainst / played : 0,
    homeSplit: {
      played: homePlayed,
      averageGoalsScored: homePlayed ? homeGoalsFor / homePlayed : null
    },
    awaySplit: {
      played: awayPlayed,
      averageGoalsScored: awayPlayed ? awayGoalsFor / awayPlayed : null
    }
  };
}

// PREDICTION ENGINE
app.get("/predict", async (req, res) => {
  const homeId = Number(req.query.home);
  const awayId = Number(req.query.away);

  if (!Number.isInteger(homeId) || homeId <= 0 ||
      !Number.isInteger(awayId) || awayId <= 0 ||
      homeId === awayId) {
    return res.status(400).json({
      error: "Valid, different home and away team IDs required"
    });
  }

  try {
    const [homeData, awayData] = await Promise.all([
      providerGet(
        `/last-five-games?teamId=${homeId}`,
        `form:${homeId}`,
        CACHE_TIMES.form
      ),
      providerGet(
        `/last-five-games?teamId=${awayId}`,
        `form:${awayId}`,
        CACHE_TIMES.form
      )
    ]);

    const homeMatches = getArray(homeData);
    const awayMatches = getArray(awayData);

    const home = getTeamStats(homeMatches, homeId);
    const away = getTeamStats(awayMatches, awayId);

    if (home.played < 3 || away.played < 3) {
      return res.status(422).json({
        error: "Insufficient recent match data",
        homeMatches: home.played,
        awayMatches: away.played,
        message: "At least three completed matches per team are required."
      });
    }

    // Preliminary expected goals model.
    const homeGoals = Math.max(
      0.15,
      (home.averageGoalsScored + away.averageGoalsConceded) / 2 + 0.20
    );

    const awayGoals = Math.max(
      0.15,
      (away.averageGoalsScored + home.averageGoalsConceded) / 2
    );

    function poisson(lambda, goals) {
      let probability = Math.exp(-lambda);

      for (let i = 1; i <= goals; i++) {
        probability *= lambda / i;
      }

      return probability;
    }

    const maxGoals = 10;

    let hp = Array.from(
      { length: maxGoals + 1 },
      (_, i) => poisson(homeGoals, i)
    );

    let ap = Array.from(
      { length: maxGoals + 1 },
      (_, i) => poisson(awayGoals, i)
    );

    // Normalize to account for the probability tail above maxGoals.
    const normalize = values => {
      const total = values.reduce((sum, value) => sum + value, 0);
      return values.map(value => value / total);
    };

    hp = normalize(hp);
    ap = normalize(ap);

    const outcomes = {
      homeWin: 0,
      draw: 0,
      awayWin: 0,
      bttsYes: 0,
      bttsNo: 0,
      over05: 0,
      over15: 0,
      over25: 0,
      over35: 0,
      under25: 0,
      under35: 0,
      homeCleanSheet: 0,
      awayCleanSheet: 0,
      homeOrDraw: 0,
      awayOrDraw: 0
    };

    for (let x = 0; x <= maxGoals; x++) {
      for (let y = 0; y <= maxGoals; y++) {
        const p = hp[x] * ap[y];
        const totalGoals = x + y;

        if (x > y) outcomes.homeWin += p;
        if (x === y) outcomes.draw += p;
        if (x < y) outcomes.awayWin += p;

        if (x > 0 && y > 0) outcomes.bttsYes += p;
        if (x === 0 || y === 0) outcomes.bttsNo += p;

        if (totalGoals >= 1) outcomes.over05 += p;
        if (totalGoals >= 2) outcomes.over15 += p;
        if (totalGoals >= 3) outcomes.over25 += p;
        if (totalGoals >= 4) outcomes.over35 += p;

        if (totalGoals <= 2) outcomes.under25 += p;
        if (totalGoals <= 3) outcomes.under35 += p;

        if (y === 0) outcomes.homeCleanSheet += p;
        if (x === 0) outcomes.awayCleanSheet += p;

        if (x >= y) outcomes.homeOrDraw += p;
        if (y >= x) outcomes.awayOrDraw += p;
      }
    }

    const percent = value =>
      Number((value * 100).toFixed(1));

    const probabilities = {};

    for (const [key, value] of Object.entries(outcomes)) {
      probabilities[key] = percent(value);
    }

    res.json({
      model: "Preliminary Poisson model using recent five-match form",
      home,
      away,
      estimatedGoals: {
        home: Number(homeGoals.toFixed(2)),
        away: Number(awayGoals.toFixed(2))
      },
      probabilities,
      strengthComparison: {
        homePointsPerGame: Number(home.pointsPerGame.toFixed(2)),
        awayPointsPerGame: Number(away.pointsPerGame.toFixed(2)),
        homeRecentGoalDifference: Number(
          (home.averageGoalsScored - home.averageGoalsConceded).toFixed(2)
        ),
        awayRecentGoalDifference: Number(
          (away.averageGoalsScored - away.averageGoalsConceded).toFixed(2)
        )
      },
      factors: {
        recentForm: "Included",
        attackAndDefence: "Included",
        homeAdvantage: "Small model adjustment",
        homeAwaySplits: "Displayed where available; not fully modelled",
        headToHead: "Separate endpoint; not included in probabilities",
        injuries: "Unavailable",
        suspensions: "Unavailable",
        confirmedLineups: "Not included in probabilities",
        leagueStrength: "Not included",
        weather: "Not included in probabilities",
        fixtureCongestion: "Not included"
      },
      warning:
        "Experimental statistical estimates, not calibrated betting probabilities or guarantees. Based on limited recent form. Missing injuries, lineups, league strength, venue and schedule effects can materially change outcomes."
    });

  } catch (error) {
    sendError(res, error);
  }
});

// START SERVER
app.listen(PORT, () => {
  console.log(`FBIS API running on port ${PORT}`);
});

