import { EventEmitter } from 'events';

export const jobEvents = new EventEmitter();

export const JobEvents = {
  SUCCESS: 'job:success',
  FAILURE: 'job:failure',
};
