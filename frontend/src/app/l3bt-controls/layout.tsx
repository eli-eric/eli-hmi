import style from './layout.module.css'
export default function L3btLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return <div className={style.layout}>{children}</div>
}
