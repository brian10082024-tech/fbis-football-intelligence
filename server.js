const express = require("express");

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    system: "FBIS",
    version: "1.0",
    status: "Backend online"
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "OK" });
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`FBIS API running on port ${PORT}`);
});
