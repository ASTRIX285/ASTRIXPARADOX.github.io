#!/usr/bin/env node
// Opens Miguel's installed Google Chrome (not Playwright's browser, no automation flags) with a
// dedicated profile outside the repo and remote debugging on 127.0.0.1:9222, then exits. It never
// connects to or scripts the browser: Miguel signs in to Bungie himself, then tells Claude, and only
// then does perf-measure.mjs attach. A dedicated profile is needed because Chrome blocks remote
// debugging on the default profile. Cookies stay in that profile and are never printed or copied.
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {DEFAULT_PROFILE_DIR,outsideRepo} from './perf-paths.mjs';

const profile=outsideRepo(process.env.ASTRIX_PERF_PROFILE||DEFAULT_PROFILE_DIR,'the browser profile');
const candidates=[process.env.ASTRIX_CHROME,join(process.env.ProgramFiles||'C:\\Program Files','Google\\Chrome\\Application\\chrome.exe'),join(process.env['ProgramFiles(x86)']||'C:\\Program Files (x86)','Google\\Chrome\\Application\\chrome.exe'),join(process.env.LOCALAPPDATA||'','Google\\Chrome\\Application\\chrome.exe')].filter(Boolean);
const chrome=candidates.find(path=>existsSync(path));
if(!chrome){console.error('Google Chrome was not found. Set ASTRIX_CHROME to chrome.exe.');process.exit(1);}
const child=spawn(chrome,['--remote-debugging-port=9222','--remote-debugging-address=127.0.0.1',`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','https://astrixparadox.com/astrix-app/pages/home/'],{detached:true,stdio:'ignore'});
child.unref();
console.log('Sign in, wait for your Guardian on Home, then tell Claude.');
