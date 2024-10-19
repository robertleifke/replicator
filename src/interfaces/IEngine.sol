// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >=0.8.4;

import "./engine/IEngineActions.sol";
import "./engine/IEngineEvents.sol";
import "./engine/IEngineView.sol";
import "./engine/IEngineErrors.sol";

/// @title Engine Interface
interface IEngine is
    IEngineActions,
    IEngineEvents,
    IEngineView,
    IEngineErrors
{

}
