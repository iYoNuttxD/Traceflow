import express from 'express';
import { controller } from './sample.controller.js';
import { repository } from './sample.repository.js';

export const invalidSchemaDependencies = { express, controller, repository };
