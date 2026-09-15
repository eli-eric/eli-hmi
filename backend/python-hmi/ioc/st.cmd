#!../../bin/linux-x86_64/softIoc
#
# IOC startup script for a stock EPICS base installation.
#
#   softIoc -d ioc/db/l4-opcpa.db          # simplest: no st.cmd needed at all
#   softIoc ioc/st.cmd                     # this file, from backend/python-hmi
#
# `run_ioc.py` does the same thing from a pip install (pythonSoftIOC brings
# EPICS base along as a wheel) and is the path that needs nothing built. This
# file exists for a machine that already has base, and for the Dockerfile.

dbLoadDatabase("$(EPICS_BASE)/dbd/softIoc.dbd")
softIoc_registerRecordDeviceDriver(pdbbase)

dbLoadRecords("db/l4-opcpa.db")

iocInit()

# `dbl` lists every PV, which is the quickest check that the database loaded
# what the config asked for.
dbl
