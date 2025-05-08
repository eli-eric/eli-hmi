'use client'

import { ClearButton } from '@/components/ui/buttons'
import { ContainerCard, ContentCard } from '@/components/ui/cards'
import { CardTitle } from '@/components/ui/cards/card-title'
import {
  ButtonHTMLAttributes,
  createContext,
  FC,
  PropsWithChildren,
} from 'react'

import style from './meter.module.css'
import { withWebSocketData } from '../withWebSocketData'
import { Message } from '@/lib/websocket-provider/message'

const MeterContext = createContext<{ value: number | null }>({ value: null })

const MeterContainer: FC<PropsWithChildren> = ({ children }) => {
  return (
    <MeterContext.Provider value={{ value: null }}>
      <ContainerCard>{children}</ContainerCard>
    </MeterContext.Provider>
  )
}

interface MeterProps {
  label: string
  children?: React.ReactNode
}

const Title: FC<MeterProps> = ({ label, children }) => {
  return <CardTitle label={label}>{children}</CardTitle>
}

interface TitleButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tooltipContent?: string
  isProcessing?: boolean
  timeout?: number
}

const TitleButton: FC<TitleButtonProps> = (props) => {
  return <ClearButton {...props} />
}

interface LabelProps {
  label: string
}

const Label: FC<LabelProps> = ({ label }) => {
  return (
    <div className={style.labelContainer}>
      <span>{label}</span>
    </div>
  )
}

const Card: FC<PropsWithChildren> = ({ children }) => {
  return <ContentCard>{children}</ContentCard>
}

const CardLabel: FC<PropsWithChildren> = ({ children }) => {
  return <div className={style.cardTitle}>{children}</div>
}

interface SensorProps {
  label?: string
  data?: Message<number> | null
}

const Sensor: FC<SensorProps> = ({ label, data }) => {
  return (
    <div className={style.sensorContainer}>
      <span>{`${data?.value?.toExponential(2)} ${
        data?.units && data.units
      }`}</span>
      <span>{label}</span>
    </div>
  )
}
const SensorPV = withWebSocketData(Sensor)

export const Meter = Object.assign(MeterContainer, {
  Title,
  Label,
  TitleButton,
  Card,
  CardLabel,
  SensorPV,
})
