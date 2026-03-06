--
-- PostgreSQL database dump
--

\restrict btSEOlFDfFgeFFt4Ja7fXVIhv8J5UUuy89DdGImnK8zO9rSdjbg9hr3V7K5fTfg

-- Dumped from database version 17.7 (Debian 17.7-3.pgdg13+1)
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE IF EXISTS ONLY public.teams DROP CONSTRAINT IF EXISTS teams_league_id_fkey;
ALTER TABLE IF EXISTS ONLY public.team_seasons DROP CONSTRAINT IF EXISTS team_seasons_team_id_fkey;
ALTER TABLE IF EXISTS ONLY public.team_seasons DROP CONSTRAINT IF EXISTS team_seasons_season_id_fkey;
ALTER TABLE IF EXISTS ONLY public.seasons DROP CONSTRAINT IF EXISTS seasons_league_id_fkey;
ALTER TABLE IF EXISTS ONLY public.player_seasons DROP CONSTRAINT IF EXISTS player_seasons_team_season_id_fkey;
ALTER TABLE IF EXISTS ONLY public.player_seasons DROP CONSTRAINT IF EXISTS player_seasons_player_id_fkey;
ALTER TABLE IF EXISTS ONLY public.player_season_stats DROP CONSTRAINT IF EXISTS player_season_stats_player_season_id_fkey;
ALTER TABLE IF EXISTS ONLY public.player_external_ids DROP CONSTRAINT IF EXISTS player_external_ids_player_id_fkey;
DROP INDEX IF EXISTS public.idx_teams_name;
DROP INDEX IF EXISTS public.idx_seasons_league_id;
DROP INDEX IF EXISTS public.idx_players_full_name;
DROP INDEX IF EXISTS public.idx_player_seasons_team_season_id;
DROP INDEX IF EXISTS public.idx_player_seasons_player_id;
DROP INDEX IF EXISTS public.idx_player_scrape_jobs_status;
DROP INDEX IF EXISTS public.idx_player_scrape_jobs_pending;
ALTER TABLE IF EXISTS ONLY public.teams DROP CONSTRAINT IF EXISTS teams_pkey;
ALTER TABLE IF EXISTS ONLY public.team_seasons DROP CONSTRAINT IF EXISTS team_seasons_pkey;
ALTER TABLE IF EXISTS ONLY public.seasons DROP CONSTRAINT IF EXISTS seasons_pkey;
ALTER TABLE IF EXISTS ONLY public.players DROP CONSTRAINT IF EXISTS players_sr_player_id_key;
ALTER TABLE IF EXISTS ONLY public.players DROP CONSTRAINT IF EXISTS players_pkey;
ALTER TABLE IF EXISTS ONLY public.player_seasons DROP CONSTRAINT IF EXISTS player_seasons_pkey;
ALTER TABLE IF EXISTS ONLY public.player_season_stats DROP CONSTRAINT IF EXISTS player_season_stats_pkey;
ALTER TABLE IF EXISTS ONLY public.player_scrape_jobs DROP CONSTRAINT IF EXISTS player_scrape_jobs_player_url_key;
ALTER TABLE IF EXISTS ONLY public.player_scrape_jobs DROP CONSTRAINT IF EXISTS player_scrape_jobs_pkey;
ALTER TABLE IF EXISTS ONLY public.player_external_ids DROP CONSTRAINT IF EXISTS player_external_ids_source_external_id_key;
ALTER TABLE IF EXISTS ONLY public.player_external_ids DROP CONSTRAINT IF EXISTS player_external_ids_pkey;
ALTER TABLE IF EXISTS ONLY public.leagues DROP CONSTRAINT IF EXISTS leagues_pkey;
ALTER TABLE IF EXISTS public.teams ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.team_seasons ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.seasons ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.players ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.player_seasons ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.player_season_stats ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.player_scrape_jobs ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.player_external_ids ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.leagues ALTER COLUMN id DROP DEFAULT;
DROP SEQUENCE IF EXISTS public.teams_id_seq;
DROP TABLE IF EXISTS public.teams;
DROP SEQUENCE IF EXISTS public.team_seasons_id_seq;
DROP TABLE IF EXISTS public.team_seasons;
DROP SEQUENCE IF EXISTS public.seasons_id_seq;
DROP TABLE IF EXISTS public.seasons;
DROP SEQUENCE IF EXISTS public.players_id_seq;
DROP TABLE IF EXISTS public.players;
DROP SEQUENCE IF EXISTS public.player_seasons_id_seq;
DROP TABLE IF EXISTS public.player_seasons;
DROP SEQUENCE IF EXISTS public.player_season_stats_id_seq;
DROP TABLE IF EXISTS public.player_season_stats;
DROP SEQUENCE IF EXISTS public.player_scrape_jobs_id_seq;
DROP TABLE IF EXISTS public.player_scrape_jobs;
DROP SEQUENCE IF EXISTS public.player_external_ids_id_seq;
DROP TABLE IF EXISTS public.player_external_ids;
DROP SEQUENCE IF EXISTS public.leagues_id_seq;
DROP TABLE IF EXISTS public.leagues;
SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: leagues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leagues (
    id integer NOT NULL,
    name text NOT NULL,
    country text
);


--
-- Name: leagues_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.leagues_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: leagues_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.leagues_id_seq OWNED BY public.leagues.id;


--
-- Name: player_external_ids; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_external_ids (
    id integer NOT NULL,
    player_id integer NOT NULL,
    source text NOT NULL,
    external_id text NOT NULL
);


--
-- Name: player_external_ids_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.player_external_ids_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: player_external_ids_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.player_external_ids_id_seq OWNED BY public.player_external_ids.id;


--
-- Name: player_scrape_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_scrape_jobs (
    id integer NOT NULL,
    player_url text NOT NULL,
    status text DEFAULT 'pending'::text,
    attempts integer DEFAULT 0,
    last_error text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: player_scrape_jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.player_scrape_jobs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: player_scrape_jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.player_scrape_jobs_id_seq OWNED BY public.player_scrape_jobs.id;


--
-- Name: player_season_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_season_stats (
    id integer NOT NULL,
    player_season_id integer NOT NULL,
    games integer,
    minutes integer,
    points integer,
    rebounds integer,
    assists integer,
    steals integer,
    blocks integer,
    fg_pct numeric,
    three_pct numeric,
    ft_pct numeric
);


--
-- Name: player_season_stats_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.player_season_stats_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: player_season_stats_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.player_season_stats_id_seq OWNED BY public.player_season_stats.id;


--
-- Name: player_seasons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_seasons (
    id integer NOT NULL,
    player_id integer NOT NULL,
    team_season_id integer NOT NULL,
    jersey_number integer,
    games_played integer
);


--
-- Name: player_seasons_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.player_seasons_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: player_seasons_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.player_seasons_id_seq OWNED BY public.player_seasons.id;


--
-- Name: players; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.players (
    id integer NOT NULL,
    full_name text NOT NULL,
    first_name text,
    last_name text,
    birth_date date,
    height_cm integer,
    weight_kg integer,
    "position" text,
    nationality text,
    created_at timestamp without time zone DEFAULT now(),
    birth_place text,
    sr_player_id text
);


--
-- Name: players_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.players_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: players_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.players_id_seq OWNED BY public.players.id;


--
-- Name: seasons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seasons (
    id integer NOT NULL,
    league_id integer NOT NULL,
    year_start integer NOT NULL,
    year_end integer NOT NULL
);


--
-- Name: seasons_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seasons_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: seasons_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.seasons_id_seq OWNED BY public.seasons.id;


--
-- Name: team_seasons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_seasons (
    id integer NOT NULL,
    team_id integer NOT NULL,
    season_id integer NOT NULL,
    wins integer,
    losses integer
);


--
-- Name: team_seasons_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.team_seasons_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: team_seasons_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.team_seasons_id_seq OWNED BY public.team_seasons.id;


--
-- Name: teams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teams (
    id integer NOT NULL,
    name text NOT NULL,
    city text,
    abbreviation text,
    league_id integer
);


--
-- Name: teams_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.teams_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: teams_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.teams_id_seq OWNED BY public.teams.id;


--
-- Name: leagues id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leagues ALTER COLUMN id SET DEFAULT nextval('public.leagues_id_seq'::regclass);


--
-- Name: player_external_ids id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_external_ids ALTER COLUMN id SET DEFAULT nextval('public.player_external_ids_id_seq'::regclass);


--
-- Name: player_scrape_jobs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_scrape_jobs ALTER COLUMN id SET DEFAULT nextval('public.player_scrape_jobs_id_seq'::regclass);


--
-- Name: player_season_stats id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_season_stats ALTER COLUMN id SET DEFAULT nextval('public.player_season_stats_id_seq'::regclass);


--
-- Name: player_seasons id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_seasons ALTER COLUMN id SET DEFAULT nextval('public.player_seasons_id_seq'::regclass);


--
-- Name: players id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.players ALTER COLUMN id SET DEFAULT nextval('public.players_id_seq'::regclass);


--
-- Name: seasons id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seasons ALTER COLUMN id SET DEFAULT nextval('public.seasons_id_seq'::regclass);


--
-- Name: team_seasons id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_seasons ALTER COLUMN id SET DEFAULT nextval('public.team_seasons_id_seq'::regclass);


--
-- Name: teams id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams ALTER COLUMN id SET DEFAULT nextval('public.teams_id_seq'::regclass);


--
-- Name: leagues leagues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leagues
    ADD CONSTRAINT leagues_pkey PRIMARY KEY (id);


--
-- Name: player_external_ids player_external_ids_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_external_ids
    ADD CONSTRAINT player_external_ids_pkey PRIMARY KEY (id);


--
-- Name: player_external_ids player_external_ids_source_external_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_external_ids
    ADD CONSTRAINT player_external_ids_source_external_id_key UNIQUE (source, external_id);


--
-- Name: player_scrape_jobs player_scrape_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_scrape_jobs
    ADD CONSTRAINT player_scrape_jobs_pkey PRIMARY KEY (id);


--
-- Name: player_scrape_jobs player_scrape_jobs_player_url_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_scrape_jobs
    ADD CONSTRAINT player_scrape_jobs_player_url_key UNIQUE (player_url);


--
-- Name: player_season_stats player_season_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_season_stats
    ADD CONSTRAINT player_season_stats_pkey PRIMARY KEY (id);


--
-- Name: player_seasons player_seasons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_seasons
    ADD CONSTRAINT player_seasons_pkey PRIMARY KEY (id);


--
-- Name: players players_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.players
    ADD CONSTRAINT players_pkey PRIMARY KEY (id);


--
-- Name: players players_sr_player_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.players
    ADD CONSTRAINT players_sr_player_id_key UNIQUE (sr_player_id);


--
-- Name: seasons seasons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seasons
    ADD CONSTRAINT seasons_pkey PRIMARY KEY (id);


--
-- Name: team_seasons team_seasons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_seasons
    ADD CONSTRAINT team_seasons_pkey PRIMARY KEY (id);


--
-- Name: teams teams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);


--
-- Name: idx_player_scrape_jobs_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_player_scrape_jobs_pending ON public.player_scrape_jobs USING btree (id) WHERE (status = 'pending'::text);


--
-- Name: idx_player_scrape_jobs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_player_scrape_jobs_status ON public.player_scrape_jobs USING btree (status);


--
-- Name: idx_player_seasons_player_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_player_seasons_player_id ON public.player_seasons USING btree (player_id);


--
-- Name: idx_player_seasons_team_season_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_player_seasons_team_season_id ON public.player_seasons USING btree (team_season_id);


--
-- Name: idx_players_full_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_players_full_name ON public.players USING btree (full_name);


--
-- Name: idx_seasons_league_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_seasons_league_id ON public.seasons USING btree (league_id);


--
-- Name: idx_teams_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_teams_name ON public.teams USING btree (name);


--
-- Name: player_external_ids player_external_ids_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_external_ids
    ADD CONSTRAINT player_external_ids_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: player_season_stats player_season_stats_player_season_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_season_stats
    ADD CONSTRAINT player_season_stats_player_season_id_fkey FOREIGN KEY (player_season_id) REFERENCES public.player_seasons(id) ON DELETE CASCADE;


--
-- Name: player_seasons player_seasons_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_seasons
    ADD CONSTRAINT player_seasons_player_id_fkey FOREIGN KEY (player_id) REFERENCES public.players(id);


--
-- Name: player_seasons player_seasons_team_season_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_seasons
    ADD CONSTRAINT player_seasons_team_season_id_fkey FOREIGN KEY (team_season_id) REFERENCES public.team_seasons(id);


--
-- Name: seasons seasons_league_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seasons
    ADD CONSTRAINT seasons_league_id_fkey FOREIGN KEY (league_id) REFERENCES public.leagues(id);


--
-- Name: team_seasons team_seasons_season_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_seasons
    ADD CONSTRAINT team_seasons_season_id_fkey FOREIGN KEY (season_id) REFERENCES public.seasons(id);


--
-- Name: team_seasons team_seasons_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_seasons
    ADD CONSTRAINT team_seasons_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id);


--
-- Name: teams teams_league_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_league_id_fkey FOREIGN KEY (league_id) REFERENCES public.leagues(id);


--
-- PostgreSQL database dump complete
--

\unrestrict btSEOlFDfFgeFFt4Ja7fXVIhv8J5UUuy89DdGImnK8zO9rSdjbg9hr3V7K5fTfg

