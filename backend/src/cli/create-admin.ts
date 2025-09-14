#!/usr/bin/env node

import dotenv from 'dotenv';
import { DatabaseConnection } from '../database/connection';
import { AdminUserRepository, AdminAuditRepository } from '../database/models/AdminUser';

// Load environment variables
dotenv.config();

async function createAdminUser() {
  console.log('🔐 Creating initial admin user...\n');

  try {
    // Test database connection
    const connected = await DatabaseConnection.testConnection();
    if (!connected) {
      console.error('❌ Cannot connect to database');
      process.exit(1);
    }

    console.log('✅ Connected to database');

    const userRepo = new AdminUserRepository();
    const auditRepo = new AdminAuditRepository();

    // Check if any admin users exist
    const existingUsers = await userRepo.listUsers();
    if (existingUsers.length > 0) {
      console.log('⚠️  Admin users already exist:');
      existingUsers.forEach(user => {
        console.log(`   - ${user.username} (${user.email})`);
      });
      console.log('\nUse the interactive CLI to manage users: npm run admin');
      process.exit(0);
    }

    // Create default admin user
    const defaultUser = {
      username: 'admin',
      email: 'admin@whirlcrypt.local',
      password: 'whirlcrypt123!',
      mfaEnabled: false
    };

    console.log('Creating default admin user:');
    console.log(`Username: ${defaultUser.username}`);
    console.log(`Email: ${defaultUser.email}`);
    console.log(`Password: ${defaultUser.password}`);
    console.log(`MFA: ${defaultUser.mfaEnabled ? 'Enabled' : 'Disabled'}`);
    console.log('');

    const user = await userRepo.createUser(defaultUser);

    await auditRepo.logAction({
      username: 'SYSTEM',
      action: 'CREATE_INITIAL_ADMIN',
      resource: `user:${user.username}`,
      success: true,
      metadata: { 
        userId: user.id, 
        mfaEnabled: user.mfaEnabled,
        createdBy: 'create-admin-script'
      }
    });

    console.log('✅ Admin user created successfully!');
    console.log('');

    if (user.mfaEnabled && user.mfaSecret) {
      console.log('🔐 MFA Setup Required:');
      console.log('');
      console.log(`Secret: ${user.mfaSecret}`);
      console.log('');
      console.log('Setup instructions:');
      console.log('1. Install an authenticator app (Google Authenticator, Authy, etc.)');
      console.log('2. Add a new account using the secret above');
      console.log('3. Or use the QR code from the admin panel after login');
      console.log('');
      
      if (user.mfaBackupCodes && user.mfaBackupCodes.length > 0) {
        console.log('🔑 Backup Codes (save these securely):');
        user.mfaBackupCodes.forEach((code, index) => {
          console.log(`   ${index + 1}. ${code}`);
        });
        console.log('');
      }
    }

    console.log('🚀 Next steps:');
    console.log('1. Start the server: npm run dev');
    console.log('2. Login at: http://192.168.1.100:3001/api/admin/auth/login');
    console.log('3. Change the default password immediately');
    console.log('4. Use the CLI for user management: npm run admin');
    console.log('');
    console.log('⚠️  SECURITY WARNING:');
    console.log('   - Change the default password immediately');
    console.log('   - Set up MFA if not already enabled');
    console.log('   - Review and update JWT_SECRET in .env file');
    console.log('');

  } catch (error) {
    console.error('❌ Error creating admin user:', (error as Error).message);
    console.error('');
    console.error('Troubleshooting:');
    console.error('1. Ensure PostgreSQL is running');
    console.error('2. Check database connection settings in .env');
    console.error('3. Run database initialization: npm run admin:init-db');
    process.exit(1);
  } finally {
    DatabaseConnection.close();
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Goodbye!');
  DatabaseConnection.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  DatabaseConnection.close();
  process.exit(0);
});

// Run the script
if (require.main === module) {
  createAdminUser().catch(error => {
    console.error('❌ Fatal error:', error.message);
    DatabaseConnection.close();
    process.exit(1);
  });
}
