ARG BASE_IMAGE=oraclelinux@sha256:4750c036a007b76bf6269180536c23428ea20f8931edade7701676a2cbae5ce2
FROM ${BASE_IMAGE}
RUN if command -v microdnf >/dev/null; then microdnf install -y python3 git gzip tar xz curl gcc-c++ make openssl findutils mysql && microdnf clean all; else dnf install -y python3 git gzip tar xz curl gcc-c++ make openssl findutils mysql && dnf clean all; fi
RUN curl --fail --silent --show-error --location https://nodejs.org/dist/v22.23.4/SHASUMS256.txt -o /tmp/SHASUMS256.txt \
 && curl --fail --silent --show-error --location https://nodejs.org/dist/v22.23.4/node-v22.23.4-linux-arm64.tar.xz -o /tmp/node-v22.23.4-linux-arm64.tar.xz \
 && cd /tmp && grep ' node-v22.23.4-linux-arm64.tar.xz$' SHASUMS256.txt | sha256sum --check \
 && test "$(sha256sum node-v22.23.4-linux-arm64.tar.xz | cut -d' ' -f1)" = 6287aa46b6c375d816e63ae66d024fbbfd70404825aabdfdf898a970871d2f4b \
 && tar -xJf node-v22.23.4-linux-arm64.tar.xz --strip-components=1 -C /usr/local && rm /tmp/node-v22.23.4-linux-arm64.tar.xz /tmp/SHASUMS256.txt
RUN git config --system --add safe.directory /src
