import { SignInForm } from '../components/sign-in.form'
import styles from './sign-in.module.css'

export default function SignInPage() {
  return (
    <div className={styles.centered}>
      <div className={styles.signInContainer}>
        <div className={styles.header}>
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
