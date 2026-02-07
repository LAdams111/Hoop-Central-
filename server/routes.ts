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

    const [stats, awards] = await Promise.all([
      storage.getPlayerStats(id),
      storage.getPlayerAwards(id)
    ]);
    res.json({ ...player, stats, awards });
  });

  // Increment Player Views
  app.post("/api/players/:id/view", async (req, res) => {
    const id = Number(req.params.id);
    await storage.incrementPlayerViews(id);
    res.json({ success: true });
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
    team: "Lakers",
    height: "6'9\"",
    weight: "250 lbs",
    jerseyNumber: 23,
    headshotUrl: "https://cdn.nba.com/headshots/nba/latest/1040x760/2544.png",
    bio: "LeBron Raymone James Sr. is an American professional basketball player for the Los Angeles Lakers. widely considered one of the greatest players in NBA history.",
    hometown: "Akron, OH",
    birthDate: "1984-12-30",
  });

  await storage.createPlayerStats({ playerId: lebron.id, season: "2023-24", team: "Lakers", gamesPlayed: 71, pointsPerGame: "25.7", reboundsPerGame: "7.3", assistsPerGame: "8.3", stealsPerGame: "1.3", blocksPerGame: "0.5", fieldGoalPct: "54.0" });
  await storage.createPlayerStats({ playerId: lebron.id, season: "2022-23", team: "Lakers", gamesPlayed: 55, pointsPerGame: "28.9", reboundsPerGame: "8.3", assistsPerGame: "6.8", stealsPerGame: "0.9", blocksPerGame: "0.6", fieldGoalPct: "50.0" });
  await storage.createPlayerStats({ playerId: lebron.id, season: "2021-22", team: "Lakers", gamesPlayed: 56, pointsPerGame: "30.3", reboundsPerGame: "8.2", assistsPerGame: "6.2", stealsPerGame: "1.3", blocksPerGame: "1.1", fieldGoalPct: "52.4" });
  await storage.createPlayerStats({ playerId: lebron.id, season: "2020-21", team: "Lakers", gamesPlayed: 45, pointsPerGame: "25.0", reboundsPerGame: "7.7", assistsPerGame: "7.8", stealsPerGame: "1.1", blocksPerGame: "0.6", fieldGoalPct: "51.3" });

  // 2. Stephen Curry
  const curry = await storage.createPlayer({
    name: "Stephen Curry",
    position: "PG",
    team: "Warriors",
    height: "6'2\"",
    weight: "185 lbs",
    jerseyNumber: 30,
    headshotUrl: "https://cdn.nba.com/headshots/nba/latest/1040x760/201939.png",
    bio: "Wardell Stephen Curry II is an American professional basketball player for the Golden State Warriors. Widely regarded as the greatest shooter of all time.",
    hometown: "Akron, OH",
    birthDate: "1988-03-14",
  });

  await storage.createPlayerStats({ playerId: curry.id, season: "2023-24", team: "Warriors", gamesPlayed: 74, pointsPerGame: "26.4", reboundsPerGame: "4.5", assistsPerGame: "5.1", stealsPerGame: "0.7", blocksPerGame: "0.4", fieldGoalPct: "45.0" });
  await storage.createPlayerStats({ playerId: curry.id, season: "2022-23", team: "Warriors", gamesPlayed: 56, pointsPerGame: "29.4", reboundsPerGame: "6.1", assistsPerGame: "6.3", stealsPerGame: "0.9", blocksPerGame: "0.4", fieldGoalPct: "49.3" });
  await storage.createPlayerStats({ playerId: curry.id, season: "2021-22", team: "Warriors", gamesPlayed: 64, pointsPerGame: "25.5", reboundsPerGame: "5.2", assistsPerGame: "6.3", stealsPerGame: "1.3", blocksPerGame: "0.3", fieldGoalPct: "43.7" });
  await storage.createPlayerStats({ playerId: curry.id, season: "2020-21", team: "Warriors", gamesPlayed: 63, pointsPerGame: "32.0", reboundsPerGame: "5.5", assistsPerGame: "5.8", stealsPerGame: "1.2", blocksPerGame: "0.1", fieldGoalPct: "48.2" });

  // 3. Klay Thompson
  const klay = await storage.createPlayer({
    name: "Klay Thompson",
    position: "SG",
    team: "Warriors",
    height: "6'6\"",
    weight: "215 lbs",
    jerseyNumber: 11,
    headshotUrl: "https://cdn.nba.com/headshots/nba/latest/1040x760/202691.png",
    bio: "Klay Alexander Thompson is an American professional basketball player for the Golden State Warriors. He is a four-time NBA champion.",
    hometown: "Los Angeles, CA",
    birthDate: "1990-02-08",
  });

  await storage.createPlayerStats({ playerId: klay.id, season: "2023-24", team: "Warriors", gamesPlayed: 77, pointsPerGame: "17.9", reboundsPerGame: "3.3", assistsPerGame: "2.3", stealsPerGame: "0.6", blocksPerGame: "0.5", fieldGoalPct: "43.2" });
  await storage.createPlayerStats({ playerId: klay.id, season: "2022-23", team: "Warriors", gamesPlayed: 69, pointsPerGame: "21.9", reboundsPerGame: "4.1", assistsPerGame: "2.4", stealsPerGame: "0.7", blocksPerGame: "0.4", fieldGoalPct: "43.6" });
  await storage.createPlayerStats({ playerId: klay.id, season: "2021-22", team: "Warriors", gamesPlayed: 32, pointsPerGame: "20.4", reboundsPerGame: "3.9", assistsPerGame: "2.8", stealsPerGame: "0.5", blocksPerGame: "0.5", fieldGoalPct: "42.9" });
  await storage.createPlayerStats({ playerId: klay.id, season: "2020-21", team: "Warriors", gamesPlayed: 0, pointsPerGame: "0.0", reboundsPerGame: "0.0", assistsPerGame: "0.0", stealsPerGame: "0.0", blocksPerGame: "0.0", fieldGoalPct: "0.0" });
  await storage.createPlayerStats({ playerId: klay.id, season: "2018-19", team: "Warriors", gamesPlayed: 78, pointsPerGame: "21.5", reboundsPerGame: "3.8", assistsPerGame: "2.4", stealsPerGame: "1.1", blocksPerGame: "0.6", fieldGoalPct: "46.7" });

  // 4. Nikola Jokic
  const jokic = await storage.createPlayer({
    name: "Nikola Jokić",
    position: "C",
    team: "Nuggets",
    height: "6'11\"",
    weight: "284 lbs",
    jerseyNumber: 15,
    headshotUrl: "https://cdn.nba.com/headshots/nba/latest/1040x760/203999.png",
    bio: "Nikola Jokić is a Serbian professional basketball player for the Denver Nuggets. He is a multi-time NBA MVP and NBA Champion.",
    hometown: "Sombor, Serbia",
    birthDate: "1995-02-19",
  });

  await storage.createPlayerStats({ playerId: jokic.id, season: "2023-24", team: "Nuggets", gamesPlayed: 79, pointsPerGame: "26.4", reboundsPerGame: "12.4", assistsPerGame: "9.0", stealsPerGame: "1.4", blocksPerGame: "0.9", fieldGoalPct: "58.3" });
  await storage.createPlayerStats({ playerId: jokic.id, season: "2022-23", team: "Nuggets", gamesPlayed: 69, pointsPerGame: "24.5", reboundsPerGame: "11.8", assistsPerGame: "9.8", stealsPerGame: "1.3", blocksPerGame: "0.7", fieldGoalPct: "63.2" });
  await storage.createPlayerStats({ playerId: jokic.id, season: "2021-22", team: "Nuggets", gamesPlayed: 74, pointsPerGame: "27.1", reboundsPerGame: "13.8", assistsPerGame: "7.9", stealsPerGame: "1.5", blocksPerGame: "0.9", fieldGoalPct: "58.3" });
  await storage.createPlayerStats({ playerId: jokic.id, season: "2020-21", team: "Nuggets", gamesPlayed: 72, pointsPerGame: "26.4", reboundsPerGame: "10.8", assistsPerGame: "8.3", stealsPerGame: "1.3", blocksPerGame: "0.7", fieldGoalPct: "56.6" });

  // 5. Kevin Durant
  const kd = await storage.createPlayer({
    name: "Kevin Durant",
    position: "PF",
    team: "Suns",
    height: "6'11\"",
    weight: "240 lbs",
    jerseyNumber: 35,
    headshotUrl: "https://cdn.nba.com/headshots/nba/latest/1040x760/201142.png",
    bio: "Kevin Wayne Durant is an American professional basketball player for the Phoenix Suns. He is a two-time NBA champion and MVP.",
    hometown: "Washington, D.C.",
    birthDate: "1988-09-29",
  });

  await storage.createPlayerStats({ playerId: kd.id, season: "2023-24", team: "Suns", gamesPlayed: 75, pointsPerGame: "27.1", reboundsPerGame: "6.6", assistsPerGame: "5.0", stealsPerGame: "0.9", blocksPerGame: "1.2", fieldGoalPct: "52.3" });
  await storage.createPlayerStats({ playerId: kd.id, season: "2022-23", team: "Suns", gamesPlayed: 47, pointsPerGame: "29.1", reboundsPerGame: "6.7", assistsPerGame: "5.0", stealsPerGame: "0.7", blocksPerGame: "1.4", fieldGoalPct: "56.0" });
  await storage.createPlayerStats({ playerId: kd.id, season: "2021-22", team: "Nets", gamesPlayed: 55, pointsPerGame: "29.9", reboundsPerGame: "7.4", assistsPerGame: "6.4", stealsPerGame: "0.9", blocksPerGame: "0.9", fieldGoalPct: "51.8" });
  await storage.createPlayerStats({ playerId: kd.id, season: "2020-21", team: "Nets", gamesPlayed: 35, pointsPerGame: "26.9", reboundsPerGame: "7.1", assistsPerGame: "5.6", stealsPerGame: "0.7", blocksPerGame: "1.3", fieldGoalPct: "53.7" });

  // 6. Michael Jordan (Historical)
  const mj = await storage.createPlayer({
    name: "Michael Jordan",
    position: "SG",
    team: "Bulls",
    height: "6'6\"",
    weight: "216 lbs",
    jerseyNumber: 23,
    headshotUrl: "https://cdn.nba.com/headshots/nba/latest/1040x760/893.png",
    bio: "Michael Jeffrey Jordan is an American businessman and former professional basketball player. He is widely considered the greatest basketball player of all time.",
    hometown: "Brooklyn, NY",
    birthDate: "1963-02-17",
  });

  await storage.createPlayerStats({ playerId: mj.id, season: "1997-98", team: "Bulls", gamesPlayed: 82, pointsPerGame: "28.7", reboundsPerGame: "5.8", assistsPerGame: "3.5", stealsPerGame: "1.7", blocksPerGame: "0.5", fieldGoalPct: "46.5" });
  await storage.createPlayerStats({ playerId: mj.id, season: "1995-96", team: "Bulls", gamesPlayed: 82, pointsPerGame: "30.4", reboundsPerGame: "6.6", assistsPerGame: "4.3", stealsPerGame: "2.2", blocksPerGame: "0.5", fieldGoalPct: "49.5" });
  await storage.createPlayerStats({ playerId: mj.id, season: "1992-93", team: "Bulls", gamesPlayed: 78, pointsPerGame: "32.6", reboundsPerGame: "6.7", assistsPerGame: "5.5", stealsPerGame: "2.8", blocksPerGame: "0.8", fieldGoalPct: "49.5" });
  await storage.createPlayerStats({ playerId: mj.id, season: "1987-88", team: "Bulls", gamesPlayed: 82, pointsPerGame: "35.0", reboundsPerGame: "5.5", assistsPerGame: "5.9", stealsPerGame: "3.2", blocksPerGame: "1.6", fieldGoalPct: "53.5" });

  // 2020-21 Warriors Roster Additions
  const wiggins = await storage.createPlayer({
    name: "Andrew Wiggins",
    position: "SF",
    team: "Warriors",
    height: "6'7\"",
    weight: "197 lbs",
    jerseyNumber: 22,
    headshotUrl: "https://cdn.nba.com/headshots/nba/latest/1040x760/203952.png",
    bio: "Andrew Wiggins is a Canadian professional basketball player for the Golden State Warriors. He was the first overall pick in the 2014 NBA draft.",
    hometown: "Toronto, Canada",
    birthDate: "1995-02-23",
  });
  await storage.createPlayerStats({ playerId: wiggins.id, season: "2020-21", team: "Warriors", gamesPlayed: 71, pointsPerGame: "18.6", reboundsPerGame: "4.9", assistsPerGame: "2.4", stealsPerGame: "0.9", blocksPerGame: "1.0", fieldGoalPct: "47.7" });

  const draymond = await storage.createPlayer({
    name: "Draymond Green",
    position: "PF",
    team: "Warriors",
    height: "6'6\"",
    weight: "230 lbs",
    jerseyNumber: 23,
    headshotUrl: "https://cdn.nba.com/headshots/nba/latest/1040x760/203110.png",
    bio: "Draymond Green is an American professional basketball player for the Golden State Warriors. He is a multi-time NBA champion and Defensive Player of the Year.",
    hometown: "Saginaw, MI",
    birthDate: "1990-03-04",
  });
  await storage.createPlayerStats({ playerId: draymond.id, season: "2020-21", team: "Warriors", gamesPlayed: 63, pointsPerGame: "7.0", reboundsPerGame: "7.1", assistsPerGame: "8.9", stealsPerGame: "1.7", blocksPerGame: "0.8", fieldGoalPct: "44.7" });

  const looney = await storage.createPlayer({
    name: "Kevon Looney",
    position: "C",
    team: "Warriors",
    height: "6'9\"",
    weight: "222 lbs",
    jerseyNumber: 5,
    headshotUrl: "https://cdn.nba.com/headshots/nba/latest/1040x760/1626172.png",
    bio: "Kevon Looney is an American professional basketball player for the Golden State Warriors. He has won multiple NBA championships with the team.",
    hometown: "Milwaukee, WI",
    birthDate: "1996-02-06",
  });
  await storage.createPlayerStats({ playerId: looney.id, season: "2020-21", team: "Warriors", gamesPlayed: 61, pointsPerGame: "4.1", reboundsPerGame: "5.3", assistsPerGame: "2.0", stealsPerGame: "0.3", blocksPerGame: "0.4", fieldGoalPct: "54.8" });

  const poole = await storage.createPlayer({
    name: "Jordan Poole",
    position: "SG",
    team: "Warriors",
    height: "6'4\"",
    weight: "194 lbs",
    jerseyNumber: 3,
    headshotUrl: "https://cdn.nba.com/headshots/nba/latest/1040x760/1629673.png",
    bio: "Jordan Poole is an American professional basketball player. He was a key contributor to the Warriors' 2022 championship run.",
    hometown: "Milwaukee, WI",
    birthDate: "1999-06-19",
  });
  await storage.createPlayerStats({ playerId: poole.id, season: "2020-21", team: "Warriors", gamesPlayed: 51, pointsPerGame: "12.0", reboundsPerGame: "1.8", assistsPerGame: "1.9", stealsPerGame: "0.5", blocksPerGame: "0.2", fieldGoalPct: "43.2" });

  const wiseman = await storage.createPlayer({
    name: "James Wiseman",
    position: "C",
    team: "Warriors",
    height: "7'0\"",
    weight: "240 lbs",
    jerseyNumber: 33,
    headshotUrl: "https://cdn.nba.com/headshots/nba/latest/1040x760/1630164.png",
    bio: "James Wiseman is an American professional basketball player. He was selected second overall by the Warriors in the 2020 NBA draft.",
    hometown: "Nashville, TN",
    birthDate: "2001-03-31",
  });
  await storage.createPlayerStats({ playerId: wiseman.id, season: "2020-21", team: "Warriors", gamesPlayed: 39, pointsPerGame: "11.5", reboundsPerGame: "5.8", assistsPerGame: "0.7", stealsPerGame: "0.3", blocksPerGame: "0.9", fieldGoalPct: "51.9" });

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
