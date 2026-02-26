/**
 * Tests for pathValidator.ts
 */

import { validatePath, isSensitivePath, validateEnvVar } from '../src/ai/security/pathValidator';

console.log('Testing pathValidator.ts\n');
console.log('='.repeat(80));

let passed = 0;
let failed = 0;

function test(label: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`✅ ${label}`);
  } catch (error) {
    failed++;
    console.log(`❌ ${label}`);
    console.log(`   Error: ${error instanceof Error ? error.message : error}`);
  }
}

// Test path traversal detection
test('Blocks path traversal with ../', async () => {
  const result = await validatePath('/tmp/../etc/passwd');
  if (result.valid) {
    throw new Error('Should block path traversal');
  }
});

test('Blocks path traversal in middle', async () => {
  const result = await validatePath('/home/user/../../../etc/passwd');
  if (result.valid) {
    throw new Error('Should block path traversal');
  }
});

test('Allows normal paths', async () => {
  const result = await validatePath('/tmp/normal/file.txt');
  if (!result.valid) {
    throw new Error(`Should allow normal path: ${result.error}`);
  }
});

test('Allows relative paths without traversal', async () => {
  const result = await validatePath('./src/file.ts');
  if (!result.valid) {
    throw new Error(`Should allow relative path: ${result.error}`);
  }
});

// Test sensitive path detection
test('Blocks .ssh directory', async () => {
  if (!await isSensitivePath('/home/user/.ssh/id_rsa')) {
    throw new Error('Should block .ssh files');
  }
});

test('Blocks .aws credentials', async () => {
  if (!await isSensitivePath('/home/user/.aws/credentials')) {
    throw new Error('Should block AWS credentials');
  }
});

test('Blocks .env files', async () => {
  if (!await isSensitivePath('/project/.env')) {
    throw new Error('Should block .env files');
  }
});

test('Blocks .env.local files', async () => {
  if (!await isSensitivePath('/project/.env.local')) {
    throw new Error('Should block .env.local files');
  }
});

test('Blocks /etc/passwd', async () => {
  if (!await isSensitivePath('/etc/passwd')) {
    throw new Error('Should block /etc/passwd');
  }
});

test('Blocks /etc/shadow', async () => {
  if (!await isSensitivePath('/etc/shadow')) {
    throw new Error('Should block /etc/shadow');
  }
});

test('Allows normal files', async () => {
  if (await isSensitivePath('/home/user/project/src/index.ts')) {
    throw new Error('Should allow normal source files');
  }
});

test('Allows README files', async () => {
  if (await isSensitivePath('/home/user/project/README.md')) {
    throw new Error('Should allow README');
  }
});

// Test environment variable validation
test('Blocks API_KEY variable', () => {
  try {
    validateEnvVar('OPENAI_API_KEY');
    throw new Error('Should have thrown for API_KEY');
  } catch (error) {
    if (error instanceof Error && error.message.includes('Should have thrown')) {
      throw error;
    }
    // Expected to throw
  }
});

test('Blocks SECRET variable', () => {
  try {
    validateEnvVar('DATABASE_SECRET');
    throw new Error('Should have thrown for SECRET');
  } catch (error) {
    if (error instanceof Error && error.message.includes('Should have thrown')) {
      throw error;
    }
  }
});

test('Blocks PASSWORD variable', () => {
  try {
    validateEnvVar('ADMIN_PASSWORD');
    throw new Error('Should have thrown for PASSWORD');
  } catch (error) {
    if (error instanceof Error && error.message.includes('Should have thrown')) {
      throw error;
    }
  }
});

test('Blocks TOKEN variable', () => {
  try {
    validateEnvVar('GITHUB_TOKEN');
    throw new Error('Should have thrown for TOKEN');
  } catch (error) {
    if (error instanceof Error && error.message.includes('Should have thrown')) {
      throw error;
    }
  }
});

test('Blocks PATH variable (security risk)', () => {
  try {
    validateEnvVar('PATH');
    throw new Error('Should have thrown for PATH');
  } catch (error) {
    if (error instanceof Error && error.message.includes('Should have thrown')) {
      throw error;
    }
  }
});

test('Blocks HOME variable (security risk)', () => {
  try {
    validateEnvVar('HOME');
    throw new Error('Should have thrown for HOME');
  } catch (error) {
    if (error instanceof Error && error.message.includes('Should have thrown')) {
      throw error;
    }
  }
});

test('Allows USER variable', () => {
  validateEnvVar('USER'); // Should not throw
});

test('Allows SHELL variable', () => {
  validateEnvVar('SHELL'); // Should not throw
});

// Test validatePath with sensitive paths
test('validatePath blocks sensitive file', async () => {
  const result = await validatePath('/home/user/.ssh/id_rsa');
  if (result.valid) {
    throw new Error('Should block SSH key');
  }
  if (!result.error?.includes('sensitive')) {
    throw new Error(`Reason should mention sensitive file, got: ${result.error}`);
  }
});

test('validatePath blocks traversal to sensitive', async () => {
  const result = await validatePath('/tmp/../.ssh/id_rsa');
  if (result.valid) {
    throw new Error('Should block traversal to SSH key');
  }
});

// Test case-insensitive matching on macOS
test('Blocks .SSH (uppercase) on case-insensitive filesystems', async () => {
  const isBlocked = await isSensitivePath('/Users/testuser/.SSH/id_rsa');
  if (!isBlocked) {
    throw new Error('Should block .SSH (uppercase variant)');
  }
});

test('Blocks .Ssh (mixed case) on case-insensitive filesystems', async () => {
  const isBlocked = await isSensitivePath('/Users/testuser/.Ssh/Config');
  if (!isBlocked) {
    throw new Error('Should block .Ssh/Config (mixed case)');
  }
});

test('Blocks .BASHRC (uppercase) on case-insensitive filesystems', async () => {
  const isBlocked = await isSensitivePath('/home/user/.BASHRC');
  if (!isBlocked) {
    throw new Error('Should block .BASHRC (uppercase)');
  }
});

test('Blocks .BaSh_PrOfIlE (mixed case) on case-insensitive filesystems', async () => {
  const isBlocked = await isSensitivePath('~/.BaSh_PrOfIlE');
  if (!isBlocked) {
    throw new Error('Should block .BaSh_PrOfIlE (mixed case)');
  }
});

console.log('='.repeat(80));
console.log(`\nResults: ${passed}/${passed + failed} passed, ${failed} failed`);

process.exit(failed > 0 ? 1 : 0);
