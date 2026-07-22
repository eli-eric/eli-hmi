#!../../bin/linux-x86_64/softIOC

< envPaths

cd "${TOP}"

## Register all support components
dbLoadDatabase "dbd/softIOC.dbd"
softIOC_registerRecordDeviceDriver pdbbase

## Load record instances
dbLoadRecords("db/laser.db", "CP=L4-NSOPCPA-NL1")

cd "${TOP}/iocBoot/${IOC}"
iocInit
