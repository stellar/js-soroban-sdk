const xdr = SorobanClient.xdr;

describe("Server#simulateTransaction", function () {
  let keypair = SorobanClient.Keypair.random();
  let account = new SorobanClient.Account(
    keypair.publicKey(),
    "56199647068161"
  );

  let contractId = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
  let contract = new SorobanClient.Contract(contractId);
  let address = contract.address().toScAddress();

  const simulationResponse = {
    id: 1,
    events: [],
    latestLedger: 3,
    minResourceFee: "15",
    transactionData: new SorobanClient.SorobanDataBuilder().build().toXDR('base64'),
    results: [{
      auth: [
        new SorobanClient.xdr.SorobanAuthorizationEntry({
          // Include a credentials w/ a nonce
          credentials:
            new SorobanClient.xdr.SorobanCredentials.sorobanCredentialsAddress(
              new SorobanClient.xdr.SorobanAddressCredentials({
                address: address,
                nonce: new SorobanClient.xdr.Int64(1234),
                signatureExpirationLedger: 1,
                signatureArgs: [],
              })
            ),
          // Basic fake invocation
          rootInvocation: new SorobanClient.xdr.SorobanAuthorizedInvocation({
            function:
              SorobanClient.xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
                new SorobanClient.xdr.SorobanAuthorizedContractFunction({
                  contractAddress: address,
                  functionName: "test",
                  args: [],
                })
              ),
            subInvocations: [],
          }),
        }).toXDR('base64'),
      ],
      xdr: SorobanClient.xdr.ScVal.scvU32(0).toXDR('base64'),
    }],
    cost: {
      cpuInsns: "0",
      memBytes: "0",
    },
  };

  const parsedSimulationResponse = {
    id: simulationResponse.id,
    events: simulationResponse.events,
    latestLedger: simulationResponse.latestLedger,
    minResourceFee: simulationResponse.minResourceFee,
    transactionData:
      new SorobanClient.SorobanDataBuilder(simulationResponse.transactionData),
    result: {
      auth: simulationResponse.results[0].auth.map(
        entry => SorobanClient.xdr.SorobanAuthorizationEntry.fromXDR(entry, 'base64')
      ),
      retval: SorobanClient.xdr.ScVal.fromXDR(simulationResponse.results[0].xdr, 'base64'),
    },
    cost: simulationResponse.cost,
  }

  beforeEach(function () {
    this.server = new SorobanClient.Server(serverUrl);
    this.axiosMock = sinon.mock(AxiosClient);
    const source = new SorobanClient.Account(
      "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI",
      "1"
    );
    function emptyContractTransaction() {
      return new SorobanClient.TransactionBuilder(source, {
        fee: 100,
        networkPassphrase: "Test",
        v1: true,
      })
        .addOperation(
          SorobanClient.Operation.invokeHostFunction({
            func: new SorobanClient.xdr.HostFunction.hostFunctionTypeInvokeContract(
              []
            ),
            auth: [],
          })
        )
        .setTimeout(SorobanClient.TimeoutInfinite)
        .build();
    }

    const transaction = emptyContractTransaction();
    transaction.sign(keypair);

    this.transaction = transaction;
    this.hash = this.transaction.hash().toString("hex");
    this.blob = transaction.toEnvelope().toXDR().toString("base64");
  });

  afterEach(function () {
    this.axiosMock.verify();
    this.axiosMock.restore();
  });

  it("simulates a transaction", function (done) {
    this.axiosMock
      .expects("post")
      .withArgs(serverUrl, {
        jsonrpc: "2.0",
        id: 1,
        method: "simulateTransaction",
        params: [this.blob],
      })
      .returns(
        Promise.resolve({ data: { id: 1, result: simulationResponse } })
      );

    this.server
      .simulateTransaction(this.transaction)
      .then(function (response) {
        expect(response).to.be.deep.equal(parsedSimulationResponse);
        done();
      })
      .catch(function (err) {
        done(err);
      });
  });

  it("works when there are no results", function() {
    const simResponseCopy = JSON.parse(JSON.stringify(simulationResponse));
    simResponseCopy.results = undefined;

    const parsedCopy = JSON.parse(JSON.stringify(parsedSimulationResponse));
    parsedCopy.result = undefined;

    const parsed = SorobanClient.parseRawSimulation(simResponseCopy)
    expect(parsed).to.deep.equal(parsedCopy);
  });

  it("works with no auth", function(done) {
    const simResponseCopy = JSON.parse(JSON.stringify(simulationResponse));
    simResponseCopy.results[0].auth = undefined;

    this.axiosMock
      .expects("post")
      .withArgs(serverUrl, {
        jsonrpc: "2.0",
        id: 1,
        method: "simulateTransaction",
        params: [this.blob],
      })
      .returns(
        Promise.resolve({ data: { id: 1, result: simResponseCopy } })
      );

    this.server
      .simulateTransaction(this.transaction)
      .then(function (response) {
        const parsedCopy = JSON.parse(JSON.stringify(parsedSimulationResponse));
        parsedCopy.result.auth = [];

        expect(response).to.be.deep.equal(parsedCopy,
          `.result.auth should be [], got ${JSON.stringify(response)}`);
        done();
      })
      .catch(function (err) {
        done(err);
      });
  })

  xit("adds metadata - tx was too small and was immediately deleted");
  xit("adds metadata, order immediately fills");
  xit("adds metadata, order is open");
  xit("adds metadata, partial fill");
  xit("doesnt add metadata to non-offers");
  xit("adds metadata about offers, even if some ops are not");
  xit("simulates fee bump transactions");
});
