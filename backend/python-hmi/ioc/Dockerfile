# A stock EPICS base 7.0.8 IOC serving the generated database.
#
# Moved here from `backend/epics/example-epics.Dockerfile` and pointed at the
# generated db instead of the hand-written one.
#
# You do NOT need this to run the HMI against real Channel Access:
# `python ioc/run_ioc.py` is the same iocCore from a pip wheel, with nothing to
# build. This image is worth the ~10 minute base build when you want the EPICS
# command-line tools (`caget`, `caput`, `camonitor`, `dbpr`) beside the IOC, or
# an image to hand to someone who has neither Python nor EPICS.
FROM rockylinux:9

RUN dnf upgrade --refresh -y && \
    dnf install -y gcc git make perl && \
    dnf clean all

RUN mkdir -p /usr/EPICS/epics-base
WORKDIR /usr/EPICS/epics-base

COPY base-7.0.8.tar.gz .
RUN tar -xf base-7.0.8.tar.gz --strip-components=1 && \
    make -j"$(nproc)" && \
    rm -f base-7.0.8.tar.gz

ENV EPICS_BASE=/usr/EPICS/epics-base
ENV EPICS_HOST_ARCH=linux-x86_64
ENV PATH=${EPICS_BASE}/bin/${EPICS_HOST_ARCH}:${PATH}

WORKDIR /usr/EPICS/ioc
COPY db/testz.db db/testz.db
COPY st.cmd st.cmd

# `-S` runs without the interactive iocsh, so the container logs cleanly under
# compose. Drop it (and use `docker run -it`) when you want `dbl` / `dbpr`.
ENTRYPOINT ["softIoc", "-S", "-d", "db/testz.db"]
