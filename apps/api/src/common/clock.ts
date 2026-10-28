import { type DynamicModule, Module } from '@nestjs/common';

/** Nguồn thời gian duy nhất của server; test thay bằng đồng hồ giả để tua thời gian. */
export interface Clock {
  now(): Date;
}

export const CLOCK = Symbol('CLOCK');

export const systemClock: Clock = { now: () => new Date() };

@Module({})
export class ClockModule {
  static forRoot(clock: Clock = systemClock): DynamicModule {
    return {
      module: ClockModule,
      global: true,
      providers: [{ provide: CLOCK, useValue: clock }],
      exports: [CLOCK],
    };
  }
}
