import dotenv from 'dotenv'
import QRCode from 'qrcode'
import chalk from 'chalk'
import { DatabaseConnection } from '../src/database/connection'
import { AdminUserRepository } from '../src/database/models/AdminUser'

async function main() {
  dotenv.config()
  const username = process.argv[2] || 'admin'

  const connected = await DatabaseConnection.testConnection()
  if (!connected) {
    console.error('Cannot connect to database')
    process.exit(1)
  }

  const repo = new AdminUserRepository()
  const user = await repo.findByUsername(username)
  if (!user) {
    console.error(`User not found: ${username}`)
    process.exit(1)
  }

  // Ensure MFA is enabled and generate a fresh secret
  const { secret, qrCode } = await repo.generateMfaSecret(user.id, user.username)
  await repo.updateUser(user.id, { mfaEnabled: true })

  const otpauthUrl = qrCode || `otpauth://totp/Whirlcrypt%20(${encodeURIComponent(username)})?secret=${secret}&issuer=Whirlcrypt`

  // Print concise output first
  console.log(`MFA reset for user: ${username}`)
  console.log(`Secret (base32): ${secret}`)
  console.log(`OTPAuth URL: ${otpauthUrl}`)

  // Try to render ASCII QR (optional)
  try {
    const ascii = await QRCode.toString(otpauthUrl, { type: 'terminal' })
    console.log('\nScan this QR code with your authenticator app:')
    console.log(ascii)
  } catch (e) {
    console.log(chalk.yellow('Could not render ASCII QR. Use the secret or OTPAuth URL above.'))
  }

  DatabaseConnection.close()
}

main().catch((e) => {
  console.error('Error:', e?.message || e)
  DatabaseConnection.close()
  process.exit(1)
})

