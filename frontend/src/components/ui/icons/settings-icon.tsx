import styles from './icon.module.css'

export const SettingsIcon = () => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 18 18"
      fill="none"
      className={styles.settingsIcon}
      width="20"
      height="20"
    >
      <path
        d="M5.625 1.125V8.4375M5.625 8.4375C6.86764 8.4375 7.875 9.44483 7.875 10.6875C7.875 11.9302 6.86764 12.9375 5.625 12.9375C4.38236 12.9375 3.375 11.9302 3.375 10.6875C3.375 9.44483 4.38236 8.4375 5.625 8.4375ZM5.625 13.5V15.75M12.375 15.75V8.4375M12.375 8.4375C11.1324 8.4375 10.125 7.43017 10.125 6.1875C10.125 4.94483 11.1324 3.9375 12.375 3.9375C13.6176 3.9375 14.625 4.94483 14.625 6.1875C14.625 7.43017 13.6176 8.4375 12.375 8.4375ZM12.375 3.375V1.125"
        stroke="black"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
