use std::collections::HashMap;
use std::env;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{ChildStderr, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};
use std::thread;
use std::time::Instant;

use serde::{Deserialize, Serialize};

use crate::context_builder;
use crate::diagnosis_engine::{self, DiagnosisContextPacket, DiagnosisGenerationInput};
use crate::secrets;
use crate::session_store::{
    self, DiagnosisResponse, FailureContext, Host, HostConfig as HostRecordConfig, HostObservedState, Session,
    TalonWorkspaceState, TerminalSnapshot,
};

const META_SHELL_PREFIX: &str = "__TALON_META_SHELL__";
const META_CWD_PREFIX: &str = "__TALON_META_CWD__";
const CMD_START_PREFIX: &str = "__TALON_CMD_START__";
const CMD_END_PREFIX: &str = "__TALON_CMD_END__";
const CONNECT_TIMEOUT_SECONDS: u64 = 8;

include!("types.rs");
include!("state.rs");
include!("registry_ops.rs");
include!("trust.rs");
include!("transport.rs");
include!("projection.rs");
