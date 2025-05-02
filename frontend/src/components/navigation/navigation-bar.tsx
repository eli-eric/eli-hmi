import { navigationItems } from '@/lib/settings/navigation'
import { NavigationItem } from './navigation-item'
import styles from './navigation-bar.module.css'
import navItemStyles from './navigation-item.module.css'
import clsx from 'clsx'

export default function NavigationBar() {
  return (
    <nav className={styles.container}>
      <div>
        <span className={clsx(navItemStyles.item, navItemStyles.active)}>
          E3 VACUUM SYSTEM
        </span>
      </div>
      {navigationItems.map((item) => (
        <NavigationItem href={item.href} text={item.text} key={item.href} />
      ))}
    </nav>
  )
}