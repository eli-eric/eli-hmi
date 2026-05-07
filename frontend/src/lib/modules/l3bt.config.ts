import type { ModuleConfig } from './types'

export const l3btConfig: ModuleConfig = {
  heading: 'L3BT',

  interlocks: {
    title: 'L3BT Interlocks',
    checkClearPv: 'L3BT-VCS-S1:INTERLOCK',
    items: [
      { pvname: 'L3BT-VCS-S1:INTERLOCK', title: 'L3BT S1 Volume' },
      { pvname: 'L3BT-VCS-S3:INTERLOCK', title: 'L3BT S3 Volume' },
      { pvname: 'L3BT-VCS-SGV503:INTERLOCK', title: 'Valve SGV503' },
      { pvname: 'L3BT-VCS-EGV501:INTERLOCK', title: 'Valve EGV501' },
    ],
  },

  safetyPermission: {
    title: 'L3BT Machine Safety Permissions',
    items: [
      {
        pvname: 'L3BT-MSS:S1_ROUGHING_PERMISSION',
        title: 'L3BT S1 Volume Roughing',
      },
      {
        pvname: 'L3BT-MSS:S1_HIGH_VAC_PERMISSION',
        title: 'L3BT S1 Volume High Vacuum Pumping',
      },
      {
        pvname: 'L3BT-MSS:S3_ROUGHING_PERMISSION',
        title: 'L3BT S3 Volume Roughing',
      },
      {
        pvname: 'L3BT-MSS:S3_HIGH_VAC_PERMISSION',
        title: 'L3BT S3 Volume High Vacuum Pumping',
      },
      // TODO PV name unclear
      {
        pvname: 'L3BT-VCS-SGV503_toOpen:INTERLOCK',
        title: 'Valve SGV503 to Open',
      },
      // TODO PV name unclear
      {
        pvname: 'L3BT-VCS-EGV501_toOpen:INTERLOCK',
        title: 'Valve EGV501 to Open',
      },
    ],
  },

  cleanDryAir: {
    title: 'L3BT Clean Dry Air (CDA)',
    volumes: [
      {
        title: 'L3BT CDA Valve Actuation',
        pressure: {
          pvName: 'L3BT-VCS-PPS511:PRESSURE',
          label: 'PPS511',
        },
        // TODO PV name unclear
        flow: {
          pvName: 'E3-P3-PPS511:FLOW',
          label: 'PPFS511',
          options: { format: 'precision' },
        },
      },
      {
        title: 'L3BT CDA Venting',
        pressure: {
          pvName: 'L3BT-VCS-PPS511:PRESSURE',
          label: 'PPS511',
        },
        // TODO PV name unclear
        flow: {
          pvName: 'E3-P3-PPS512:FLOW',
          label: 'PPFS512',
          options: { format: 'precision' },
        },
      },
    ],
  },

  backing: {
    title: 'L3BT Backing',
    sensorBar: {
      title: 'L3BT Backing Line',
      label: 'Pressure',
      height: '20rem',
      sensorPVs: [
        { pvName: 'L3BT-VCS-APG512:PRESSURE', label: 'APG512 CH010' },
        { pvName: 'L3BT-VCS-APG532:PRESSURE', label: 'APG532 CH055' },
      ],
    },
    pump: {
      title: 'L3BT Backing Pump P025',
      // TODO PV name unclear
      rpmPV: 'AI_SPEED_P06_TEST:ActualFrequency',
      // TODO PV name unclear
      valvePv: 'BI_PUMP_P06_TEST:OPEN',
      valveLabel: 'GV025',
    },
  },

  roughing: {
    title: 'Roughing',
    sensorBar: {
      title: 'Roughing Line, P3 Outlet',
      label: 'Pressure',
      height: '20rem',
      sensorPVs: [
        { pvName: 'L3BT-VCS-APG511:PRESSURE', label: 'APG511 CH030' },
        { pvName: 'L3BT-VCS-APG531:PRESSURE', label: 'APG531 CH040' },
      ],
    },
    pump: {
      title: 'Roughing Pump P000',
      // TODO PV name unclear (was env-switched in legacy code)
      rpmPV: 'L3BT-VCS-PUMP-P04:ActualFrequency',
      // TODO PV name unclear
      valvePv: 'L3BT-PUMP-P04:VALVE',
      valveLabel: 'GV000',
    },
    locking: {
      label: 'Used And Locked By',
      pvName: 'SI_LOCKED_TEST',
    },
  },
}
