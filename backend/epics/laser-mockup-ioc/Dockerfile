FROM rockylinux:9

RUN dnf upgrade --refresh -y && \
    dnf install -y gcc git make perl && \
    dnf clean all

RUN mkdir -p /usr/EPICS/epics-base
WORKDIR /usr/EPICS/epics-base

# Build EPICS Base from the tarball in backend/epics
COPY base-7.0.8.tar.gz .
RUN tar -xf base-7.0.8.tar.gz --strip-components=1 && \
    make

ENV EPICS_BASE=/usr/EPICS/epics-base
ENV EPICS_HOST_ARCH=linux-x86_64
ENV PATH=${EPICS_BASE}/bin/${EPICS_HOST_ARCH}:${PATH}

RUN mkdir -p /usr/EPICS/db
COPY laser-mockup-ioc/laser.db /usr/EPICS/db/laser.db

# Run softIoc with the same CP macro used in st.cmd.
# NOTE: -m must come before -d, otherwise macros are not applied to the DB file.
ENTRYPOINT ["softIoc", "-S", "-m", "CP=L4-NSOPCPA-NL1", "-d", "/usr/EPICS/db/laser.db"]
