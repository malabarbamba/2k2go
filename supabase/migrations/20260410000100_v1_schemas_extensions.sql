-- Baseline v1: extensions and schemas

create extension if not exists pgcrypto;
create extension if not exists unaccent;
create extension if not exists pg_trgm;

create schema if not exists private;
create schema if not exists account;
create schema if not exists catalog;
create schema if not exists learning;
create schema if not exists progress;
create schema if not exists social;
create schema if not exists reminder;
create schema if not exists media;
create schema if not exists ops;
