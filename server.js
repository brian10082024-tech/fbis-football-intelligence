
const express = require("express");

const app = express();
const PORT = process.env.PORT || 8080;
app.use(express.static(__dirname));
app.get("/", (req, res) => {
  res.json({
    system: "FBIS",
    version: "1.0",
    status: "Backend online",
    provider: "Highlightly"
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "OK" });
});

async function getFootballMatches(date) {
  const apiKey = process.env.HIGHLIGHTLY_API_KEY;

  if (!apiKey) {
    throw new Error("HIGHLIGHTLY_API_KEY is not configured");
  }

  const url = new URL("https://soccer.highlightly.net/matches");

  url.searchParams.set("date", date);
  url.searchParams.set("timezone", "Africa/Nairobi");
  url.searchParams.set("limit", "100");

  const response = await fetch(url, {
    headers: {
      "x-rapidapi-key": apiKey
    }
  });

  const data = await response.json();

  if (!response.ok) {
    const error = new Error("Highlightly provider error");
    error.status = response.status;
    error.details = data;
    throw error;
  }

  return data;
}

app.get("/fixtures", async (req, res) => {
  const date = req.query.date;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({
      error: "Enter a date in YYYY-MM-DD format"
    });
  }

  try {
    const data = await getFootballMatches(date);
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

app.get("/matches", async (req, res) => {
  const date = req.query.date;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({
      error: "Use date format YYYY-MM-DD"
    });
  }

  try {
    const data = await getFootballMatches(date);

    const matches = (data.data || []).map(item => ({
      id: item.id,
      match: `${item.homeTeam.name} vs ${item.awayTeam.name}`,
      home: item.homeTeam.name,
      away: item.awayTeam.name,
      league: item.league.name,
      country: item.country.name,
      date: item.date,
      status: item.state.description,
      score: item.state.score.current,
      homeTeamId: item.homeTeam.id,
      awayTeamId: item.awayTeam.id,
      leagueId: item.league.id
    }));

    res.json({
      date,
      totalMatches: matches.length,
      providerTotal: data.pagination?.totalCount ?? matches.length,
      plan: data.plan || null,
      matches
    });

  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});
// TEAM'S LAST FIVE MATCHES
app.get("/team-form/:teamId", async (req, res) => {
  const teamId = req.params.teamId;

  if (!/^\d+$/.test(teamId)) {
    return res.status(400).json({ error: "Invalid team ID" });
  }

  try {
    const url = new URL("https://soccer.highlightly.net/last-five-games");
    url.searchParams.set("teamId", teamId);

    const response = await fetch(url, {
      headers: {
        "x-rapidapi-key": process.env.HIGHLIGHTLY_API_KEY
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// HEAD-TO-HEAD RECORD
app.get("/h2h", async (req, res) => {
  const { team1, team2 } = req.query;

  if (!/^\d+$/.test(team1 || "") || !/^\d+$/.test(team2 || "")) {
    return res.status(400).json({
      error: "Provide two valid team IDs"
    });
  }

  try {
    const url = new URL("https://soccer.highlightly.net/head-2-head");
    url.searchParams.set("teamIdOne", team1);
    url.searchParams.set("teamIdTwo", team2);

    const response = await fetch(url, {
      headers: {
        "x-rapidapi-key": process.env.HIGHLIGHTLY_API_KEY
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});app.get("/predict", async (req, res) => {
  const { home, away } = req.query;

  const homeId = Number(home);
  const awayId = Number(away);

  if (!Number.isInteger(homeId) || !Number.isInteger(awayId) || homeId <= 0 || awayId <= 0) {
    return res.status(400).json({ error: "Valid home and away team IDs required" });
  }

  try {
    const headers = {
      "x-rapidapi-key": process.env.HIGHLIGHTLY_API_KEY
    };

    async function getForm(id) {
      const url = new URL("https://soccer.highlightly.net/last-five-games");
      url.searchParams.set("teamId", id);

      const response = await fetch(url, { headers });
      const data = await response.json();

      if (!response.ok) throw new Error("Could not load team form");
      return Array.isArray(data) ? data : data.data || [];
    }

    function stats(matches, id) {
      let gf = 0, ga = 0, played = 0, wins = 0, draws = 0;

      for (const m of matches) {
        const score = m.state?.score?.current;
        if (!score) continue;

        const parts = score.split("-").map(Number);
        if (parts.length !== 2 || parts.some(n => !Number.isFinite(n))) continue;

        const homeSide = Number(m.homeTeam?.id) === id;
        const awaySide = Number(m.awayTeam?.id) === id;
        if (!homeSide && !awaySide) continue;

        const scored = homeSide ? parts[0] : parts[1];
        const conceded = homeSide ? parts[1] : parts[0];

        gf += scored;
        ga += conceded;
        played++;

        if (scored > conceded) wins++;
        if (scored === conceded) draws++;
      }

      return {
        played,
        gf: played ? gf / played : 0,
        ga: played ? ga / played : 0,
        wins,
        draws
      };
    }

    const [homeMatches, awayMatches] = await Promise.all([
      getForm(homeId),
      getForm(awayId)
    ]);

    const h = stats(homeMatches, homeId);
    const a = stats(awayMatches, awayId);

    if (h.played === 0 || a.played === 0) {
      return res.status(422).json({
        error: "Not enough completed matches to estimate probabilities",
        homeMatches: h.played,
        awayMatches: a.played
      });
    }

    const homeGoals = (h.gf + a.ga) / 2 + 0.25;
    const awayGoals = (a.gf + h.ga) / 2;

    function poisson(lambda, goals) {
      let p = Math.exp(-lambda);
      for (let i = 1; i <= goals; i++) p *= lambda / i;
      return p;
    }

    const hp = Array.from({length: 8}, (_, i) => poisson(homeGoals, i));
    const ap = Array.from({length: 8}, (_, i) => poisson(awayGoals, i));

    let homeWin = 0, draw = 0, awayWin = 0;
    let btts = 0, over15 = 0, over25 = 0, under35 = 0;

    for (let x = 0; x < 8; x++) {
      for (let y = 0; y < 8; y++) {
        const p = hp[x] * ap[y];

        if (x > y) homeWin += p;
        else if (x === y) draw += p;
        else awayWin += p;

        if (x > 0 && y > 0) btts += p;
        if (x + y >= 2) over15 += p;
        if (x + y >= 3) over25 += p;
        if (x + y <= 3) under35 += p;
      }
    }

    const percent = n => Number((n * 100).toFixed(1));

    res.json({
      model: "Poisson based on last five matches",
      home: {
        teamId: homeId,
        matches: h.played,
        averageGoalsScored: Number(h.gf.toFixed(2)),
        averageGoalsConceded: Number(h.ga.toFixed(2))
      },
      away: {
        teamId: awayId,
        matches: a.played,
        averageGoalsScored: Number(a.gf.toFixed(2)),
        averageGoalsConceded: Number(a.ga.toFixed(2))
      },
      estimatedGoals: {
        home: Number(homeGoals.toFixed(2)),
        away: Number(awayGoals.toFixed(2))
      },
      probabilities: {
        homeWin: percent(homeWin),
        draw: percent(draw),
        awayWin: percent(awayWin),
        bttsYes: percent(btts),
        over15: percent(over15),
        over25: percent(over25),
        under35: percent(under35)
      },
      warning: "Statistical estimates only. Not guarantees. Limited to recent form and does not yet account for injuries, lineups, venue splits or league strength."
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.listen(PORT, () => {
  console.log(`FBIS API running on port ${PORT}`);
});
