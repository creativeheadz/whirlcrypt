#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';
import QRCode from 'qrcode';
import dotenv from 'dotenv';
import { DatabaseConnection } from '../database/connection';
import { AdminUserRepository, AdminAuditRepository } from '../database/models/AdminUser';

// Load environment variables
dotenv.config();

const program = new Command();
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Filesystem fallback for when database is not available
const USERS_FILE = path.join(__dirname, '../../data/admin-users.json');
const AUDIT_FILE = path.join(__dirname, '../../data/admin-audit.json');

interface FileSystemUser {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  mfaSecret?: string;
  mfaEnabled: boolean;
  mfaBackupCodes?: string[];
  isActive: boolean;
  lastLogin?: string;
  failedLoginAttempts: number;
  lockedUntil?: string;
  createdAt: string;
  updatedAt: string;
}

class AdminCLI {
  private userRepo: AdminUserRepository;
  private auditRepo: AdminAuditRepository;
  private useDatabase: boolean = false;

  constructor() {
    this.userRepo = new AdminUserRepository();
    this.auditRepo = new AdminAuditRepository();
  }

  async initialize(): Promise<void> {
    try {
      const connected = await DatabaseConnection.testConnection();
      if (connected) {
        this.useDatabase = true;
        console.log(chalk.green('✅ Connected to database'));
      } else {
        this.useDatabase = false;
        console.log(chalk.yellow('⚠️  Database not available, using filesystem storage'));
        this.ensureDataDirectory();
      }
    } catch (error) {
      this.useDatabase = false;
      console.log(chalk.yellow('⚠️  Database not available, using filesystem storage'));
      this.ensureDataDirectory();
    }
  }

  private ensureDataDirectory(): void {
    const dataDir = path.dirname(USERS_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    if (!fs.existsSync(USERS_FILE)) {
      fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2));
    }
    
    if (!fs.existsSync(AUDIT_FILE)) {
      fs.writeFileSync(AUDIT_FILE, JSON.stringify([], null, 2));
    }
  }

  async prompt(question: string): Promise<string> {
    return new Promise((resolve) => {
      rl.question(question, resolve);
    });
  }

  private async promptPassword(question: string): Promise<string> {
    return new Promise((resolve) => {
      process.stdout.write(question);
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');

      let password = '';
      const onData = (char: any) => {
        const charStr = char.toString();
        switch (charStr) {
          case '\n':
          case '\r':
          case '\u0004':
            process.stdin.setRawMode(false);
            process.stdin.pause();
            process.stdin.removeListener('data', onData);
            process.stdout.write('\n');
            resolve(password);
            break;
          case '\u0003':
            process.exit();
            break;
          case '\u007f': // Backspace
            if (password.length > 0) {
              password = password.slice(0, -1);
              process.stdout.write('\b \b');
            }
            break;
          default:
            password += charStr;
            process.stdout.write('*');
            break;
        }
      };

      process.stdin.on('data', onData);
    });
  }

  async addUser(): Promise<void> {
    console.log(chalk.blue('\n🔐 Add New Admin User\n'));

    const username = await this.prompt('Username: ');
    if (!username.trim()) {
      console.log(chalk.red('❌ Username is required'));
      return;
    }

    const email = await this.prompt('Email: ');
    if (!email.trim() || !email.includes('@')) {
      console.log(chalk.red('❌ Valid email is required'));
      return;
    }

    const password = await this.promptPassword('Password: ');
    if (password.length < 8) {
      console.log(chalk.red('❌ Password must be at least 8 characters'));
      return;
    }

    const confirmPassword = await this.promptPassword('Confirm Password: ');
    if (password !== confirmPassword) {
      console.log(chalk.red('❌ Passwords do not match'));
      return;
    }

    const enableMfa = await this.prompt('Enable MFA? (y/N): ');
    const mfaEnabled = enableMfa.toLowerCase() === 'y' || enableMfa.toLowerCase() === 'yes';

    try {
      if (this.useDatabase) {
        const user = await this.userRepo.createUser({
          username: username.trim(),
          email: email.trim(),
          password,
          mfaEnabled
        });

        await this.auditRepo.logAction({
          username: 'CLI',
          action: 'CREATE_USER',
          resource: `user:${user.username}`,
          success: true,
          metadata: { userId: user.id, mfaEnabled }
        });

        console.log(chalk.green(`✅ User '${user.username}' created successfully`));
        
        if (mfaEnabled && user.mfaSecret) {
          await this.showMfaSetup(user.username, user.mfaSecret);
        }
      } else {
        // Filesystem implementation
        await this.createUserInFile(username.trim(), email.trim(), password, mfaEnabled);
      }
    } catch (error) {
      console.log(chalk.red(`❌ Error creating user: ${(error as Error).message}`));
    }
  }

  private async createUserInFile(username: string, email: string, password: string, mfaEnabled: boolean): Promise<void> {
    const bcrypt = require('bcrypt');
    const speakeasy = require('speakeasy');
    const { v4: uuidv4 } = require('uuid');

    const users: FileSystemUser[] = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    
    // Check if user exists
    if (users.find(u => u.username === username || u.email === email)) {
      throw new Error('User with this username or email already exists');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    let mfaSecret: string | undefined;
    let mfaBackupCodes: string[] | undefined;

    if (mfaEnabled) {
      const secret = speakeasy.generateSecret({
        name: `Whirlcrypt (${username})`,
        issuer: 'Whirlcrypt'
      });
      mfaSecret = secret.base32;
      
      mfaBackupCodes = Array.from({ length: 10 }, () =>
        randomBytes(4).toString('hex').toUpperCase()
      );
    }

    const newUser: FileSystemUser = {
      id: uuidv4(),
      username,
      email,
      passwordHash,
      mfaSecret,
      mfaEnabled,
      mfaBackupCodes,
      isActive: true,
      failedLoginAttempts: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    users.push(newUser);
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));

    console.log(chalk.green(`✅ User '${username}' created successfully`));
    
    if (mfaEnabled && mfaSecret) {
      await this.showMfaSetup(username, mfaSecret);
    }
  }

  private async showMfaSetup(username: string, secret: string): Promise<void> {
    console.log(chalk.blue('\n🔐 MFA Setup\n'));
    
    const otpauthUrl = `otpauth://totp/Whirlcrypt%20(${encodeURIComponent(username)})?secret=${secret}&issuer=Whirlcrypt`;
    
    try {
      const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
      const qrCodeAscii = await QRCode.toString(otpauthUrl, { type: 'terminal' });
      
      console.log('Scan this QR code with your authenticator app:');
      console.log(qrCodeAscii);
      console.log(`\nOr manually enter this secret: ${chalk.yellow(secret)}`);
      console.log(`\nQR Code URL: ${qrCodeDataUrl}`);
    } catch (error) {
      console.log(`Manual setup secret: ${chalk.yellow(secret)}`);
      console.log(`OTPAUTH URL: ${otpauthUrl}`);
    }
  }

  async listUsers(): Promise<void> {
    console.log(chalk.blue('\n👥 Admin Users\n'));

    try {
      if (this.useDatabase) {
        const users = await this.userRepo.listUsers();
        this.displayUsers(users);
      } else {
        const users: FileSystemUser[] = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        this.displayUsers(users);
      }
    } catch (error) {
      console.log(chalk.red(`❌ Error listing users: ${(error as Error).message}`));
    }
  }

  private displayUsers(users: any[]): void {
    if (users.length === 0) {
      console.log(chalk.yellow('No admin users found'));
      return;
    }

    users.forEach(user => {
      const status = user.isActive ? chalk.green('Active') : chalk.red('Inactive');
      const mfa = user.mfaEnabled ? chalk.green('Enabled') : chalk.gray('Disabled');
      const lastLogin = user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never';

      console.log(`${chalk.bold(user.username)} (${user.email})`);
      console.log(`  Status: ${status} | MFA: ${mfa} | Last Login: ${lastLogin}`);
      console.log(`  Created: ${new Date(user.createdAt).toLocaleString()}`);
      console.log('');
    });
  }

  async resetPassword(): Promise<void> {
    console.log(chalk.blue('\n🔑 Reset User Password\n'));

    const username = await this.prompt('Username: ');
    if (!username.trim()) {
      console.log(chalk.red('❌ Username is required'));
      return;
    }

    const password = await this.promptPassword('New Password: ');
    if (password.length < 8) {
      console.log(chalk.red('❌ Password must be at least 8 characters'));
      return;
    }

    const confirmPassword = await this.promptPassword('Confirm Password: ');
    if (password !== confirmPassword) {
      console.log(chalk.red('❌ Passwords do not match'));
      return;
    }

    try {
      if (this.useDatabase) {
        const user = await this.userRepo.findByUsername(username.trim());
        if (!user) {
          console.log(chalk.red('❌ User not found'));
          return;
        }

        await this.userRepo.updateUser(user.id, {
          password,
          failedLoginAttempts: 0,
          lockedUntil: undefined
        });

        await this.auditRepo.logAction({
          username: 'CLI',
          action: 'RESET_PASSWORD',
          resource: `user:${user.username}`,
          success: true,
          metadata: { userId: user.id }
        });

        console.log(chalk.green(`✅ Password reset for user '${user.username}'`));
      } else {
        await this.resetPasswordInFile(username.trim(), password);
      }
    } catch (error) {
      console.log(chalk.red(`❌ Error resetting password: ${(error as Error).message}`));
    }
  }

  private async resetPasswordInFile(username: string, password: string): Promise<void> {
    const bcrypt = require('bcrypt');
    const users: FileSystemUser[] = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));

    const userIndex = users.findIndex(u => u.username === username);
    if (userIndex === -1) {
      throw new Error('User not found');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    users[userIndex].passwordHash = passwordHash;
    users[userIndex].failedLoginAttempts = 0;
    users[userIndex].lockedUntil = undefined;
    users[userIndex].updatedAt = new Date().toISOString();

    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    console.log(chalk.green(`✅ Password reset for user '${username}'`));
  }

  async toggleMfa(): Promise<void> {
    console.log(chalk.blue('\n🔐 Toggle MFA\n'));

    const username = await this.prompt('Username: ');
    if (!username.trim()) {
      console.log(chalk.red('❌ Username is required'));
      return;
    }

    try {
      if (this.useDatabase) {
        const user = await this.userRepo.findByUsername(username.trim());
        if (!user) {
          console.log(chalk.red('❌ User not found'));
          return;
        }

        const newMfaStatus = !user.mfaEnabled;
        let mfaSecret: string | undefined;

        if (newMfaStatus) {
          const mfaData = await this.userRepo.generateMfaSecret(user.id, user.username);
          mfaSecret = mfaData.secret;
        }

        await this.userRepo.updateUser(user.id, { mfaEnabled: newMfaStatus });

        await this.auditRepo.logAction({
          username: 'CLI',
          action: newMfaStatus ? 'ENABLE_MFA' : 'DISABLE_MFA',
          resource: `user:${user.username}`,
          success: true,
          metadata: { userId: user.id }
        });

        console.log(chalk.green(`✅ MFA ${newMfaStatus ? 'enabled' : 'disabled'} for user '${user.username}'`));

        if (newMfaStatus && mfaSecret) {
          await this.showMfaSetup(user.username, mfaSecret);
        }
      } else {
        await this.toggleMfaInFile(username.trim());
      }
    } catch (error) {
      console.log(chalk.red(`❌ Error toggling MFA: ${(error as Error).message}`));
    }
  }

  private async toggleMfaInFile(username: string): Promise<void> {
    const speakeasy = require('speakeasy');
    const users: FileSystemUser[] = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));

    const userIndex = users.findIndex(u => u.username === username);
    if (userIndex === -1) {
      throw new Error('User not found');
    }

    const user = users[userIndex];
    const newMfaStatus = !user.mfaEnabled;

    if (newMfaStatus) {
      const secret = speakeasy.generateSecret({
        name: `Whirlcrypt (${username})`,
        issuer: 'Whirlcrypt'
      });
      user.mfaSecret = secret.base32;
      user.mfaBackupCodes = Array.from({ length: 10 }, () =>
        randomBytes(4).toString('hex').toUpperCase()
      );
    } else {
      user.mfaSecret = undefined;
      user.mfaBackupCodes = undefined;
    }

    user.mfaEnabled = newMfaStatus;
    user.updatedAt = new Date().toISOString();

    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    console.log(chalk.green(`✅ MFA ${newMfaStatus ? 'enabled' : 'disabled'} for user '${username}'`));

    if (newMfaStatus && user.mfaSecret) {
      await this.showMfaSetup(username, user.mfaSecret);
    }
  }

  async deleteUser(): Promise<void> {
    console.log(chalk.blue('\n🗑️  Delete User\n'));

    const username = await this.prompt('Username: ');
    if (!username.trim()) {
      console.log(chalk.red('❌ Username is required'));
      return;
    }

    const confirm = await this.prompt(`Are you sure you want to delete user '${username}'? (yes/no): `);
    if (confirm.toLowerCase() !== 'yes') {
      console.log(chalk.yellow('❌ Operation cancelled'));
      return;
    }

    try {
      if (this.useDatabase) {
        const user = await this.userRepo.findByUsername(username.trim());
        if (!user) {
          console.log(chalk.red('❌ User not found'));
          return;
        }

        await this.userRepo.deleteUser(user.id);

        await this.auditRepo.logAction({
          username: 'CLI',
          action: 'DELETE_USER',
          resource: `user:${user.username}`,
          success: true,
          metadata: { userId: user.id }
        });

        console.log(chalk.green(`✅ User '${user.username}' deleted successfully`));
      } else {
        await this.deleteUserFromFile(username.trim());
      }
    } catch (error) {
      console.log(chalk.red(`❌ Error deleting user: ${(error as Error).message}`));
    }
  }

  private async deleteUserFromFile(username: string): Promise<void> {
    const users: FileSystemUser[] = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));

    const userIndex = users.findIndex(u => u.username === username);
    if (userIndex === -1) {
      throw new Error('User not found');
    }

    users.splice(userIndex, 1);
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    console.log(chalk.green(`✅ User '${username}' deleted successfully`));
  }

  async showAuditLog(): Promise<void> {
    console.log(chalk.blue('\n📋 Audit Log\n'));

    const limit = parseInt(await this.prompt('Number of entries to show (default 20): ') || '20');

    try {
      if (this.useDatabase) {
        const logs = await this.auditRepo.getAuditLogs({ limit });
        this.displayAuditLogs(logs);
      } else {
        const logs = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8'));
        this.displayAuditLogs(logs.slice(-limit).reverse());
      }
    } catch (error) {
      console.log(chalk.red(`❌ Error fetching audit log: ${(error as Error).message}`));
    }
  }

  private displayAuditLogs(logs: any[]): void {
    if (logs.length === 0) {
      console.log(chalk.yellow('No audit log entries found'));
      return;
    }

    logs.forEach(log => {
      const timestamp = new Date(log.createdAt).toLocaleString();
      const status = log.success ? chalk.green('✓') : chalk.red('✗');
      const user = log.username || 'Unknown';

      console.log(`${status} ${timestamp} | ${chalk.bold(user)} | ${log.action}`);
      if (log.resource) {
        console.log(`  Resource: ${log.resource}`);
      }
      if (log.errorMessage) {
        console.log(`  Error: ${chalk.red(log.errorMessage)}`);
      }
      console.log('');
    });
  }

  async initializeDatabase(): Promise<void> {
    console.log(chalk.blue('\n🗄️  Initialize Database\n'));

    try {
      const connected = await DatabaseConnection.testConnection();
      if (!connected) {
        console.log(chalk.red('❌ Cannot connect to database'));
        return;
      }

      // Run the schema
      const schemaPath = path.join(__dirname, '../../database/schema.sql');
      if (!fs.existsSync(schemaPath)) {
        console.log(chalk.red(`❌ Schema file not found at: ${schemaPath}`));
        return;
      }

      const schema = fs.readFileSync(schemaPath, 'utf8');
      const pool = DatabaseConnection.getPool();
      await pool.query(schema);

      console.log(chalk.green('✅ Database schema initialized successfully'));
    } catch (error) {
      console.log(chalk.red(`❌ Error initializing database: ${(error as Error).message}`));
    }
  }

  close(): void {
    rl.close();
    DatabaseConnection.close();
  }
}

// CLI Command Setup
async function main() {
  const cli = new AdminCLI();
  await cli.initialize();

  program
    .name('whirlcrypt-admin')
    .description('Whirlcrypt Admin User Management CLI')
    .version('2.0.0');

  program
    .command('add-user')
    .description('Add a new admin user')
    .action(async () => {
      await cli.addUser();
      cli.close();
    });

  program
    .command('list-users')
    .description('List all admin users')
    .action(async () => {
      await cli.listUsers();
      cli.close();
    });

  program
    .command('reset-password')
    .description('Reset user password')
    .action(async () => {
      await cli.resetPassword();
      cli.close();
    });

  program
    .command('toggle-mfa')
    .description('Enable/disable MFA for a user')
    .action(async () => {
      await cli.toggleMfa();
      cli.close();
    });

  program
    .command('delete-user')
    .description('Delete an admin user')
    .action(async () => {
      await cli.deleteUser();
      cli.close();
    });

  program
    .command('audit-log')
    .description('Show audit log')
    .action(async () => {
      await cli.showAuditLog();
      cli.close();
    });

  program
    .command('init-db')
    .description('Initialize database schema')
    .action(async () => {
      await cli.initializeDatabase();
      cli.close();
    });

  // Interactive mode
  program
    .command('interactive')
    .description('Interactive mode')
    .action(async () => {
      console.log(chalk.blue('\n🔐 Whirlcrypt Admin CLI - Interactive Mode\n'));

      while (true) {
        console.log(chalk.cyan('Available commands:'));
        console.log('1. Add user');
        console.log('2. List users');
        console.log('3. Reset password');
        console.log('4. Toggle MFA');
        console.log('5. Delete user');
        console.log('6. Show audit log');
        console.log('7. Initialize database');
        console.log('0. Exit');

        const choice = await cli.prompt('\nSelect option: ');

        switch (choice) {
          case '1':
            await cli.addUser();
            break;
          case '2':
            await cli.listUsers();
            break;
          case '3':
            await cli.resetPassword();
            break;
          case '4':
            await cli.toggleMfa();
            break;
          case '5':
            await cli.deleteUser();
            break;
          case '6':
            await cli.showAuditLog();
            break;
          case '7':
            await cli.initializeDatabase();
            break;
          case '0':
            console.log(chalk.green('👋 Goodbye!'));
            cli.close();
            return;
          default:
            console.log(chalk.red('❌ Invalid option'));
        }

        console.log('\n' + '─'.repeat(50) + '\n');
      }
    });

  // Default to interactive mode if no command specified
  if (process.argv.length === 2) {
    process.argv.push('interactive');
  }

  await program.parseAsync(process.argv);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n👋 Goodbye!'));
  DatabaseConnection.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  DatabaseConnection.close();
  process.exit(0);
});

// Run the CLI
if (require.main === module) {
  main().catch(error => {
    console.error(chalk.red(`❌ Fatal error: ${error.message}`));
    DatabaseConnection.close();
    process.exit(1);
  });
}
