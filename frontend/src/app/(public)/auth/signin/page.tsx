import { SignInForm } from '../components/sign-in.form'
import styles from './sign-in.module.css'
import Image from 'next/image'

export default function SignInPage() {
  return (
    <div className={styles.centered}>
      <div className={styles.signInContainer}>
        <div className={styles.header}>
          <div className={styles.logoContainer}>
            <Image
              src="/images/polygon.svg"
              alt="ELI Logo"
              width={50}
              height={50}
              className={styles.logo}
            />
          </div>
          <h1>ELI - HMI</h1>
          <p>Human-Machine Interface</p>
          <p className={styles.subtitle}>
            Please sign in to access the control system.
          </p>
        </div>
        <SignInForm />
      </div>
    </div>
  )
}
