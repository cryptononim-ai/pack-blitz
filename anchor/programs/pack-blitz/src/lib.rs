// Pack Blitz — Solana Blitz v10 (Entertainment Finance).
// Anchor program: open a pack, VRF decides the card (1-6 roll), the
// callback stores the result on-chain. The player PDA is delegated to a
// MagicBlock Ephemeral Rollup, so pack opens are gasless and ~100ms.
//
// Adapted from MagicBlock's official roll-dice-DELEGATED example
// (https://github.com/magicblock-labs/magicblock-engine-examples/tree/main/roll-dice/anchor/programs/roll-dice-delegated)
// with the VRF quickstart API pinned to ephemeral-rollups-sdk 0.18
// (https://docs.magicblock.gg/pages/verifiable-randomness-functions-vrfs/how-to-guide/quickstart).
//
// LESSON (25 Nov 2026, found the hard way): the randomness request MUST
// use `create_request_scoped_randomness_ix` — the exact call the upstream
// delegated example uses. The first version used
// `create_request_randomness_ix_const` (from the docs quickstart); the
// request was accepted by the VRF program (Idx 16) but the callback
// `callback_open_pack` then burned its whole 273,211 CU budget and died
// with ProgramFailedToComplete (10 oracle retries, all failed, PDA stayed
// 0/0). Switched to the scoped variant to match the proven program.
use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::{
    anchor::{commit, delegate, ephemeral, vrf, vrf_callback},
    cpi::DelegateConfig,
    ephem::MagicIntentBundleBuilder,
    vrf::{
        self,
        instructions::{create_request_scoped_randomness_ix, RequestRandomnessParams},
        types::SerializableAccountMeta,
    },
};

// Program keypair generated 25 Nov 2026; secret lives only in the deploy
// secrets (never in the repo). `anchor keys sync` keeps this in sync.
declare_id!("53K2NJcMTxk36mVecCnSXzX29NmytimWh6a591oYuZSU");

pub const PLAYER_SEED: &[u8] = b"playerd2";

#[ephemeral]
#[program]
pub mod pack_blitz {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let player = &mut ctx.accounts.player;
        player.last_result = 0;
        player.rollnum = 0;
        msg!(
            "Pack Blitz player initialized: {:?}",
            ctx.accounts.player.key()
        );
        Ok(())
    }

    /// Open a pack: request VRF randomness. The callback reveals the card.
    pub fn open_pack(ctx: Context<OpenPackCtx>, client_seed: u8) -> Result<()> {
        msg!("Opening pack with client_seed={}", client_seed);
        let params = RequestRandomnessParams {
            payer: ctx.accounts.payer.key(),
            oracle_queue: ctx.accounts.oracle_queue.key(),
            callback_program_id: ID,
            callback_discriminator: instruction::CallbackOpenPack::DISCRIMINATOR.to_vec(),
            caller_seed: [client_seed; 32],
            accounts_metas: Some(vec![SerializableAccountMeta {
                pubkey: ctx.accounts.player.key(),
                is_signer: false,
                is_writable: true,
            }]),
            callback_args: Some(vec![client_seed]),
            ..Default::default()
        };
        let ix = create_request_scoped_randomness_ix(params);
        ctx.accounts
            .invoke_signed_vrf(&ctx.accounts.payer.to_account_info(), &ix)?;
        Ok(())
    }

    /// VRF callback: consume randomness, store the 1-6 roll, bump rollnum.
    /// The frontend maps 1-6 -> rarity (1-2 Common, 3-4 Rare, 5 Epic,
    /// 6 Legendary) and picks the card from on-chain rollnum.
    pub fn callback_open_pack(
        ctx: Context<CallbackOpenPackCtx>,
        randomness: [u8; 32],
        client_seed: u8,
    ) -> Result<()> {
        msg!("client_seed={}", client_seed);
        let player = &mut ctx.accounts.player;
        let rnd_u8 = vrf::rnd::random_u8_with_range(&randomness, 1, 6);
        player.last_result = rnd_u8;
        player.rollnum = player.rollnum.saturating_add(1);
        msg!("Pack revealed roll (1-6): {}", rnd_u8);
        msg!("Roll number: {}", player.rollnum);
        Ok(())
    }

    /// Delegate the player account to an Ephemeral Rollup validator.
    pub fn delegate(ctx: Context<DelegateInput>) -> Result<()> {
        ctx.accounts.delegate_player(
            &ctx.accounts.user,
            &[PLAYER_SEED, &ctx.accounts.user.key().to_bytes().as_slice()],
            DelegateConfig {
                // Optionally set a specific validator from the first remaining account
                validator: ctx.remaining_accounts.first().map(|acc| acc.key()),
                ..Default::default()
            },
        )?;
        Ok(())
    }

    /// Commit state back to base layer and undelegate.
    pub fn undelegate(ctx: Context<Undelegate>) -> Result<()> {
        MagicIntentBundleBuilder::new(
            ctx.accounts.payer.to_account_info(),
            ctx.accounts.magic_context.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
        )
        .commit_and_undelegate(&[ctx.accounts.user.to_account_info()])
        .build_and_invoke()?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(init_if_needed, payer = payer, space = 8 + 2, seeds = [PLAYER_SEED, payer.key().to_bytes().as_slice()], bump)]
    pub player: Account<'info, Player>,
    pub system_program: Program<'info, System>,
}

#[vrf]
#[derive(Accounts)]
pub struct OpenPackCtx<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [PLAYER_SEED, payer.key().to_bytes().as_slice()], bump)]
    pub player: Account<'info, Player>,
    /// CHECK: validated by the ephemeral VRF program when it processes the request
    #[account(
        mut,
        constraint =
            oracle_queue.key() == vrf::consts::DEFAULT_QUEUE ||                // Devnet
            oracle_queue.key() == vrf::consts::DEFAULT_TEST_QUEUE ||           // Local
            oracle_queue.key() == vrf::consts::DEFAULT_EPHEMERAL_QUEUE ||      // ER Devnet
            oracle_queue.key() == vrf::consts::DEFAULT_EPHEMERAL_TEST_QUEUE    // ER Local
    )]
    pub oracle_queue: UncheckedAccount<'info>,
}

#[vrf_callback]
#[derive(Accounts)]
pub struct CallbackOpenPackCtx<'info> {
    #[account(mut)]
    pub player: Account<'info, Player>,
}

#[delegate]
#[derive(Accounts)]
pub struct DelegateInput<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    /// CHECK The pda to delegate
    #[account(mut, del, seeds = [PLAYER_SEED, user.key().to_bytes().as_slice()], bump)]
    pub player: UncheckedAccount<'info>,
}

#[commit]
#[derive(Accounts)]
pub struct Undelegate<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [PLAYER_SEED, payer.key().to_bytes().as_slice()], bump)]
    pub user: Account<'info, Player>,
}

#[account]
pub struct Player {
    pub last_result: u8,
    pub rollnum: u8,
}
