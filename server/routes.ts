import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Players List
  app.get(api.players.list.path, async (req, res) => {
    const search = req.query.search as string | undefined;
    const position = req.query.position as string | undefined;
    const sortBy = req.query.sortBy as "views" | "name" | undefined;
    const players = await storage.getPlayers(search, position, sortBy);
    res.json(players);
  });

  // Player Detail (with stats)
  app.get(api.players.get.path, async (req, res) => {
    const id = Number(req.params.id);
    const player = await storage.getPlayer(id);
    
    if (!player) {
      return res.status(404).json({ message: "Player not found" });
    }

    // Increment views asynchronously
    storage.incrementPlayerViews(id).catch(err => console.error("Error incrementing views:", err));

    const [stats, awards] = await Promise.all([
      storage.getPlayerStats(id),
      storage.getPlayerAwards(id)
    ]);
    res.json({ ...player, stats, awards });
  });

  // Team Roster
  app.get("/api/teams/:team/roster/:season", async (req, res) => {
    const { team, season } = req.params;
    const roster = await storage.getRoster(team, season);
    res.json(roster);
  });

  // Seed Data function
  await seedDatabase();

  return httpServer;
}

async function seedDatabase() {
  const existing = await storage.getPlayers();
  if (existing.length > 0) return;

  console.log("Seeding database with legendary players...");

  // 1. LeBron James
  const lebron = await storage.createPlayer({
    name: "LeBron James",
    position: "SF",
    team: "Los Angeles Lakers",
    height: "6'9\"",
    weight: "250 lbs",
    jerseyNumber: 23,
    headshotUrl: "https://cdn.nba.com/headshots/nba/latest/1040x760/2544.png",
    bio: "LeBron Raymone James Sr. is an American professional basketball player for the Los Angeles Lakers. widely considered one of the greatest players in NBA history.",
  });

  await storage.createPlayerStats({ playerId: lebron.id, season: "2023-24", team: "Los Angeles Lakers", gamesPlayed: 71, pointsPerGame: "25.7", reboundsPerGame: "7.3", assistsPerGame: "8.3", stealsPerGame: "1.3", blocksPerGame: "0.5", fieldGoalPct: "54.0" });
  await storage.createPlayerStats({ playerId: lebron.id, season: "2022-23", team: "Los Angeles Lakers", gamesPlayed: 55, pointsPerGame: "28.9", reboundsPerGame: "8.3", assistsPerGame: "6.8", stealsPerGame: "0.9", blocksPerGame: "0.6", fieldGoalPct: "50.0" });
  await storage.createPlayerStats({ playerId: lebron.id, season: "2021-22", team: "Los Angeles Lakers", gamesPlayed: 56, pointsPerGame: "30.3", reboundsPerGame: "8.2", assistsPerGame: "6.2", stealsPerGame: "1.3", blocksPerGame: "1.1", fieldGoalPct: "52.4" });

  // 2. Stephen Curry
  const curry = await storage.createPlayer({
    name: "Stephen Curry",
    position: "PG",
    team: "Golden State Warriors",
    height: "6'2\"",
    weight: "185 lbs",
    jerseyNumber: 30,
    headshotUrl: "https://cdn.nba.com/headshots/nba/latest/1040x760/201939.png",
    bio: "Wardell Stephen Curry II is an American professional basketball player for the Golden State Warriors. Widely regarded as the greatest shooter of all time.",
  });

  await storage.createPlayerStats({ playerId: curry.id, season: "2023-24", team: "Golden State Warriors", gamesPlayed: 74, pointsPerGame: "26.4", reboundsPerGame: "4.5", assistsPerGame: "5.1", stealsPerGame: "0.7", blocksPerGame: "0.4", fieldGoalPct: "45.0" });
  await storage.createPlayerStats({ playerId: curry.id, season: "2022-23", team: "Golden State Warriors", gamesPlayed: 56, pointsPerGame: "29.4", reboundsPerGame: "6.1", assistsPerGame: "6.3", stealsPerGame: "0.9", blocksPerGame: "0.4", fieldGoalPct: "49.3" });

  // 3. Nikola Jokic
  const jokic = await storage.createPlayer({
    name: "Nikola Jokić",
    position: "C",
    team: "Denver Nuggets",
    height: "6'11\"",
    weight: "284 lbs",
    jerseyNumber: 15,
    headshotUrl: "https://cdn.nba.com/headshots/nba/latest/1040x760/203999.png",
    bio: "Nikola Jokić is a Serbian professional basketball player for the Denver Nuggets. He is a multi-time NBA MVP and NBA Champion.",
  });

  await storage.createPlayerStats({ playerId: jokic.id, season: "2023-24", team: "Denver Nuggets", gamesPlayed: 79, pointsPerGame: "26.4", reboundsPerGame: "12.4", assistsPerGame: "9.0", stealsPerGame: "1.4", blocksPerGame: "0.9", fieldGoalPct: "58.3" });
  await storage.createPlayerStats({ playerId: jokic.id, season: "2022-23", team: "Denver Nuggets", gamesPlayed: 69, pointsPerGame: "24.5", reboundsPerGame: "11.8", assistsPerGame: "9.8", stealsPerGame: "1.3", blocksPerGame: "0.7", fieldGoalPct: "63.2" });

  // 4. Kevin Durant
  const kd = await storage.createPlayer({
    name: "Kevin Durant",
    position: "PF",
    team: "Phoenix Suns",
    height: "6'11\"",
    weight: "240 lbs",
    jerseyNumber: 35,
    headshotUrl: "https://cdn.nba.com/headshots/nba/latest/1040x760/201142.png",
    bio: "Kevin Wayne Durant is an American professional basketball player for the Phoenix Suns. He is a two-time NBA champion and MVP.",
  });

  await storage.createPlayerStats({ playerId: kd.id, season: "2023-24", team: "Phoenix Suns", gamesPlayed: 75, pointsPerGame: "27.1", reboundsPerGame: "6.6", assistsPerGame: "5.0", stealsPerGame: "0.9", blocksPerGame: "1.2", fieldGoalPct: "52.3" });

  // 5. Michael Jordan (Historical)
  const mj = await storage.createPlayer({
    name: "Michael Jordan",
    position: "SG",
    team: "Chicago Bulls",
    height: "6'6\"",
    weight: "216 lbs",
    jerseyNumber: 23,
    headshotUrl: "https://cdn.nba.com/headshots/nba/latest/1040x760/893.png",
    bio: "Michael Jeffrey Jordan is an American businessman and former professional basketball player. He is widely considered the greatest basketball player of all time.",
  });

  await storage.createPlayerStats({ playerId: mj.id, season: "1997-98", team: "Chicago Bulls", gamesPlayed: 82, pointsPerGame: "28.7", reboundsPerGame: "5.8", assistsPerGame: "3.5", stealsPerGame: "1.7", blocksPerGame: "0.5", fieldGoalPct: "46.5" });
  await storage.createPlayerStats({ playerId: mj.id, season: "1995-96", team: "Chicago Bulls", gamesPlayed: 82, pointsPerGame: "30.4", reboundsPerGame: "6.6", assistsPerGame: "4.3", stealsPerGame: "2.2", blocksPerGame: "0.5", fieldGoalPct: "49.5" });
  await storage.createPlayerStats({ playerId: mj.id, season: "1987-88", team: "Chicago Bulls", gamesPlayed: 82, pointsPerGame: "35.0", reboundsPerGame: "5.5", assistsPerGame: "5.9", stealsPerGame: "3.2", blocksPerGame: "1.6", fieldGoalPct: "53.5" });

  // Awards Seeding
  await storage.createAward({ playerId: lebron.id, name: "NBA Champion", year: "2020" });
  await storage.createAward({ playerId: lebron.id, name: "NBA Finals MVP", year: "2020" });
  await storage.createAward({ playerId: lebron.id, name: "All-NBA First Team", year: "2020" });

  await storage.createAward({ playerId: curry.id, name: "NBA Champion", year: "2022" });
  await storage.createAward({ playerId: curry.id, name: "NBA Finals MVP", year: "2022" });
  await storage.createAward({ playerId: curry.id, name: "All-NBA First Team", year: "2021" });

  await storage.createAward({ playerId: jokic.id, name: "NBA MVP", year: "2024" });
  await storage.createAward({ playerId: jokic.id, name: "NBA MVP", year: "2022" });
  await storage.createAward({ playerId: jokic.id, name: "NBA MVP", year: "2021" });

  await storage.createAward({ playerId: kd.id, name: "NBA Champion", year: "2018" });
  await storage.createAward({ playerId: kd.id, name: "NBA Finals MVP", year: "2018" });

  await storage.createAward({ playerId: mj.id, name: "NBA MVP", year: "1998" });
  await storage.createAward({ playerId: mj.id, name: "NBA Champion", year: "1998" });
  await storage.createAward({ playerId: mj.id, name: "NBA Finals MVP", year: "1998" });
}
