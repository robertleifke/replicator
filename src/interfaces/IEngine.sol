// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >=0.8.4;

import "./engine/IengineActions.sol";
import "./engine/IengineEvents.sol";
import "./engine/IengineView.sol";
import "./engine/IengineErrors.sol";

/// @title Primitive Engine Interface
interface IEngine is
    IEngineActions,
    IEngineEvents,
    IEngineView,
    IEngineErrors
{

}
