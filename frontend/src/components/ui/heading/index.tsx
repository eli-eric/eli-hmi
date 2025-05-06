import style from './heading.module.css'
export const Heading = ({ title }: { title: string }) => {
  return (
    <div className={style.container}>
      <h1 className={style.title}>{title}</h1>
    </div>
  )
}
