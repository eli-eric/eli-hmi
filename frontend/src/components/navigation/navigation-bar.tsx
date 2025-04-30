import { navigationItems } from '@/lib/settings/navigation'
import { NavigationItem } from './navigation-item'

export default function NavigationBar() {
  return (
    <nav className="navigation-container">
      <div>
        <span className="navigation-item navigation-item--active">
          E3 VACUUM SYSTEM
        </span>
      </div>
      {navigationItems.map((item) => (
        <NavigationItem href={item.href} text={item.text} key={item.href} />
      ))}
    </nav>
  )
}
