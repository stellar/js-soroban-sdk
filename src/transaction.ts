import {
  Account,
  FeeBumpTransaction,
  Operation,
  Transaction,
  TransactionBuilder,
  xdr,
} from "stellar-base";
import { SorobanRpc } from "./soroban_rpc";

// TODO: Transaction is immutable, so we need to re-build it here. :(
export function assembleTransaction(
  raw: Transaction | FeeBumpTransaction,
  networkPassphrase: string,
  simulation: SorobanRpc.SimulateTransactionResponse,
): Transaction {
  if ("innerTransaction" in raw) {
    // TODO: Handle feebump transactions
    return assembleTransaction(
      raw.innerTransaction,
      networkPassphrase,
      simulation,
    );
  }

  if (
    raw.operations.length !== 1 ||
    raw.operations[0].type !== "invokeHostFunction"
  ) {
    throw new Error(
      "unsupported operation type, must be only one InvokeHostFunctionOp in the transaction.",
    );
  }

  const rawInvokeHostFunctionOp: any = raw.operations[0];

  if (
    !rawInvokeHostFunctionOp.functions ||
    !simulation.results ||
    rawInvokeHostFunctionOp.functions.length !== simulation.results.length
  ) {
    throw new Error(
      "preflight simulation results do not contain same count of HostFunctions that InvokeHostFunctionOp in the transaction has.",
    );
  }

  const source = new Account(raw.source, `${parseInt(raw.sequence, 10) - 1}`);
  const classicFeeNum = parseInt(raw.fee, 10) || 0;
  const minResourceFeeNum = parseInt(simulation.minResourceFee, 10) || 0;
  const txnBuilder = new TransactionBuilder(source, {
    // automatically update the 'classic' tx fee if min resource fees from simulation response
    // surpass that value.
    // 'classic' fees are measured as the product of tx.fee * 'number of operations', In soroban contract tx,
    // there can only be single operation in the tx, so can safely make simplification of classic fee = tx.fee.
    fee: Math.max(classicFeeNum + minResourceFeeNum, classicFeeNum).toString(),
    memo: raw.memo,
    networkPassphrase,
    timebounds: raw.timeBounds,
    ledgerbounds: raw.ledgerBounds,
    minAccountSequence: raw.minAccountSequence,
    minAccountSequenceAge: raw.minAccountSequenceAge,
    minAccountSequenceLedgerGap: raw.minAccountSequenceLedgerGap,
    extraSigners: raw.extraSigners,
  });

  // apply the pre-built Auth from simulation onto each Tx/Op/HostFunction
  // invocation
  const authDecoratedHostFunctions = simulation.results.map(
    (functionSimulationResult, i) => {
      const hostFn: xdr.HostFunction = rawInvokeHostFunctionOp.functions[i];
      hostFn.auth(buildContractAuth(functionSimulationResult.auth));
      return hostFn;
    },
  );

  txnBuilder.addOperation(
    Operation.invokeHostFunctions({
      functions: authDecoratedHostFunctions,
    }),
  );

  // apply the pre-built Soroban Tx Ext from simulation onto the Tx
  txnBuilder.setExt(buildExt(simulation.transactionData));

  return txnBuilder.build();
}

function buildExt(sorobanTxDataStr: string) {
  const sorobanTxData: xdr.SorobanTransactionData = xdr.SorobanTransactionData.fromXDR(
    sorobanTxDataStr,
    "base64",
  );

  // TODO - remove this workaround to use constructor on js-xdr union
  //       and use the typescript generated static factory method once fixed
  //       https://github.com/stellar/dts-xdr/issues/5
  // @ts-ignore
  const txExt = new xdr.TransactionExt(1, sorobanTxData);
  return txExt;
}

function buildContractAuth(auths: string[]): xdr.ContractAuth[] {
  const contractAuths: xdr.ContractAuth[] = [];
  for (const authStr of auths) {
    contractAuths.push(xdr.ContractAuth.fromXDR(authStr, "base64"));
  }
  return contractAuths;
}
