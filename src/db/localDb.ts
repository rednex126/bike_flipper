import fs from 'fs';
import path from 'path';
import { BicycleListing, BenchmarkPrice, TelegramConfig, ScoringParams } from '../types';

interface DbState {
  listings: BicycleListing[];
  benchmarks: BenchmarkPrice[];
  scoringParams: ScoringParams;
  telegramConfig: TelegramConfig;
  facebookGroups: string[];
}

const DB_PATH = path.join(process.cwd(), 'db.json');

const DEFAULT_STATE: DbState = {
  listings: [],
  benchmarks: [],
  scoringParams: {
    brandFactor: 8,
    sizeFactor: 9,
    conditionFactor: 7,
    priceRatioFactor: 10
  },
  telegramConfig: {
    enabled: false,
    botToken: '',
    chatId: '',
    minMarginPercent: 30,
    minScore: 75
  },
  facebookGroups: []
};

export class LocalDb {
  private static loadState(): DbState {
    try {
      if (!fs.existsSync(DB_PATH)) {
        fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_STATE, null, 2), 'utf-8');
        return DEFAULT_STATE;
      }
      const data = fs.readFileSync(DB_PATH, 'utf-8');
      const state = JSON.parse(data);
      // Ensure all fields exist
      return { ...DEFAULT_STATE, ...state };
    } catch (err) {
      console.error('[DB Loader Error] Error loading database, using default state:', err);
      return DEFAULT_STATE;
    }
  }

  private static saveState(state: DbState): void {
    try {
      fs.writeFileSync(DB_PATH, JSON.stringify(state, null, 2), 'utf-8');
    } catch (err) {
      console.error('[DB Saver Error] Error writing database to file:', err);
    }
  }

  static getListings(): BicycleListing[] {
    return this.loadState().listings;
  }

  static saveListings(listings: BicycleListing[]): void {
    const state = this.loadState();
    state.listings = listings;
    this.saveState(state);
  }

  static getBenchmarks(): BenchmarkPrice[] {
    const state = this.loadState();
    // If empty, we can populate it in server.ts
    return state.benchmarks;
  }

  static saveBenchmarks(benchmarks: BenchmarkPrice[]): void {
    const state = this.loadState();
    state.benchmarks = benchmarks;
    this.saveState(state);
  }

  static getScoringParams(): ScoringParams {
    return this.loadState().scoringParams;
  }

  static saveScoringParams(params: ScoringParams): void {
    const state = this.loadState();
    state.scoringParams = params;
    this.saveState(state);
  }

  static getTelegramConfig(): TelegramConfig {
    return this.loadState().telegramConfig;
  }

  static saveTelegramConfig(config: TelegramConfig): void {
    const state = this.loadState();
    state.telegramConfig = config;
    this.saveState(state);
  }

  static getFacebookGroups(): string[] {
    return this.loadState().facebookGroups;
  }

  static saveFacebookGroups(groups: string[]): void {
    const state = this.loadState();
    state.facebookGroups = groups;
    this.saveState(state);
  }
}
