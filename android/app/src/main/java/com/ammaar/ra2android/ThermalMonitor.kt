package com.ammaar.ra2android

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.PowerManager
import android.util.Log

class ThermalMonitor(
    private val context: Context,
    private val onStateChanged: (thermal: String, lowPower: Boolean) -> Unit
) {
    private val powerManager = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
    private var thermalListener: Any? = null
    private var powerSaveReceiver: BroadcastReceiver? = null

    var currentThermalState: String = "nominal"
        private set

    val isLowPowerMode: Boolean
        get() = powerManager?.isPowerSaveMode == true

    fun start() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && powerManager != null) {
            val listener = PowerManager.OnThermalStatusChangedListener { status ->
                val name = thermalStatusToName(status)
                if (name != currentThermalState) {
                    currentThermalState = name
                    Log.d(TAG, "Thermal status changed: $name (lowPower=$isLowPowerMode)")
                    onStateChanged(currentThermalState, isLowPowerMode)
                }
            }
            try {
                powerManager.addThermalStatusListener(context.mainExecutor, listener)
                thermalListener = listener
                currentThermalState = thermalStatusToName(powerManager.currentThermalStatus)
            } catch (e: Exception) {
                Log.w(TAG, "Failed to register thermal status listener", e)
            }
        }

        val receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                if (intent?.action == PowerManager.ACTION_POWER_SAVE_MODE_CHANGED) {
                    Log.d(TAG, "Power save mode changed: $isLowPowerMode")
                    onStateChanged(currentThermalState, isLowPowerMode)
                }
            }
        }
        val filter = IntentFilter(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED)
        context.registerReceiver(receiver, filter)
        powerSaveReceiver = receiver
    }

    fun stop() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && thermalListener != null && powerManager != null) {
            try {
                powerManager.removeThermalStatusListener(thermalListener as PowerManager.OnThermalStatusChangedListener)
            } catch (e: Exception) {
                Log.w(TAG, "Failed to remove thermal status listener", e)
            }
            thermalListener = null
        }
        powerSaveReceiver?.let {
            try {
                context.unregisterReceiver(it)
            } catch (e: Exception) {
                Log.w(TAG, "Failed to unregister power save receiver", e)
            }
            powerSaveReceiver = null
        }
    }

    companion object {
        private const val TAG = "RA2_Thermal"

        fun thermalStatusToName(status: Int): String {
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                when (status) {
                    PowerManager.THERMAL_STATUS_NONE,
                    PowerManager.THERMAL_STATUS_LIGHT -> "nominal"
                    PowerManager.THERMAL_STATUS_MODERATE -> "fair"
                    PowerManager.THERMAL_STATUS_SEVERE -> "serious"
                    PowerManager.THERMAL_STATUS_CRITICAL,
                    PowerManager.THERMAL_STATUS_EMERGENCY,
                    PowerManager.THERMAL_STATUS_SHUTDOWN -> "critical"
                    else -> "unknown"
                }
            } else {
                "nominal"
            }
        }
    }
}