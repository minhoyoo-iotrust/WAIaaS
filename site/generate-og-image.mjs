#!/usr/bin/env node
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const browser = await puppeteer.launch();
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 630 });
await page.goto(`file://${join(__dirname, 'og-template.html')}`, { waitUntil: 'networkidle0' });
await page.screenshot({ path: join(__dirname, 'og-image.png') });
await browser.close();
console.log('Generated site/og-image.png (1200x630)');
